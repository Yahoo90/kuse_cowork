import { Component, createSignal, createEffect, For, Show, onCleanup } from "solid-js";
import {
  ClaudeCodeEvent,
  ClaudeCodeRequest,
  startClaudeCode,
  respondClaudeCode,
  cancelClaudeCode,
} from "../lib/claude-code-api";
import ClaudeCodePermissionDialog from "./ClaudeCodePermissionDialog";
import ClaudeCodeAuthDialog from "./ClaudeCodeAuthDialog";
import ClaudeCodeQuestionDialog from "./ClaudeCodeQuestionDialog";
import "./ClaudeCodePanel.css";

interface OutputLine {
  id: number;
  type: "text" | "tool" | "error";
  content: string;
  timestamp: Date;
}

interface PermissionRequest {
  id: string;
  tool: string;
  description: string;
}

interface AuthRequest {
  id: string;
  service: string;
  url?: string;
}

interface QuestionRequest {
  id: string;
  text: string;
  options: string[];
}

export interface ClaudeCodeTriggerData {
  prompt: string;
  working_directory?: string;
  mcp_servers?: string[];
}

interface Props {
  onClose?: () => void;
  /** Initial configuration from Agent trigger */
  triggerData?: ClaudeCodeTriggerData | null;
  /** Callback when session completes */
  onSessionComplete?: (result: string) => void;
}

const ClaudeCodePanel: Component<Props> = (props) => {
  const [prompt, setPrompt] = createSignal("");
  const [workingDir, setWorkingDir] = createSignal("");
  const [mcpServers, setMcpServers] = createSignal<string[]>([]);
  const [output, setOutput] = createSignal<OutputLine[]>([]);
  const [isRunning, setIsRunning] = createSignal(false);
  const [permissionRequest, setPermissionRequest] = createSignal<PermissionRequest | null>(null);
  const [authRequest, setAuthRequest] = createSignal<AuthRequest | null>(null);
  const [questionRequest, setQuestionRequest] = createSignal<QuestionRequest | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [hasAutoStarted, setHasAutoStarted] = createSignal(false);

  let outputRef: HTMLDivElement | undefined;
  let unlistenFn: (() => void) | undefined;

  // Clean up previous listener before starting new session
  const cleanupListener = () => {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = undefined;
    }
  };

  // Handle trigger data from Agent
  createEffect(() => {
    const data = props.triggerData;
    if (data && !hasAutoStarted()) {
      // Set initial values
      setPrompt(data.prompt);
      if (data.working_directory) {
        setWorkingDir(data.working_directory);
      }
      if (data.mcp_servers && data.mcp_servers.length > 0) {
        setMcpServers(data.mcp_servers);
      }
      // Auto-start the session
      setHasAutoStarted(true);
      setTimeout(() => {
        startSession(data.prompt, data.working_directory, data.mcp_servers || []);
      }, 100);
    }
  });

  // Reset auto-start flag when trigger data is cleared
  createEffect(() => {
    if (!props.triggerData) {
      setHasAutoStarted(false);
    }
  });

  onCleanup(() => {
    cleanupListener();
  });

  const scrollToBottom = () => {
    if (outputRef) {
      outputRef.scrollTop = outputRef.scrollHeight;
    }
  };

  const addOutput = (type: OutputLine["type"], content: string) => {
    setOutput((prev) => [
      ...prev,
      {
        id: Date.now(),
        type,
        content,
        timestamp: new Date(),
      },
    ]);
    // Scroll after state update
    setTimeout(scrollToBottom, 0);
  };

  // Collect output for session result
  let sessionOutput: string[] = [];

  const handleEvent = (event: ClaudeCodeEvent) => {
    switch (event.type) {
      case "output":
        addOutput("text", event.content);
        sessionOutput.push(event.content);
        break;
      case "tool_use":
        addOutput("tool", `Using tool: ${event.tool}`);
        break;
      case "permission_request":
        setPermissionRequest({
          id: event.id,
          tool: event.tool,
          description: event.description,
        });
        break;
      case "auth_required":
        setAuthRequest({
          id: event.id,
          service: event.service,
          url: event.url,
        });
        break;
      case "question":
        setQuestionRequest({
          id: event.id,
          text: event.text,
          options: event.options,
        });
        break;
      case "done":
        setIsRunning(false);
        setPermissionRequest(null);
        setAuthRequest(null);
        setQuestionRequest(null);
        addOutput("text", "--- Session completed ---");
        // Notify parent of completion
        if (props.onSessionComplete) {
          props.onSessionComplete(sessionOutput.join("\n"));
        }
        break;
      case "error":
        setIsRunning(false);
        setQuestionRequest(null);
        addOutput("error", event.message);
        setError(event.message);
        break;
    }
  };

  const startSession = async (
    promptText: string,
    workingDirectory?: string,
    servers?: string[]
  ) => {
    if (!promptText.trim()) return;

    // Clean up any existing listener before starting new session
    cleanupListener();

    setError(null);
    setOutput([]);
    sessionOutput = [];
    setIsRunning(true);

    const request: ClaudeCodeRequest = {
      prompt: promptText,
      mcp_servers: servers || mcpServers(),
      working_directory: workingDirectory || workingDir() || undefined,
    };

    try {
      const { unlisten } = await startClaudeCode(request, handleEvent);
      unlistenFn = unlisten;
      addOutput("text", `> ${promptText}`);
    } catch (e) {
      setIsRunning(false);
      const errorMessage = e instanceof Error ? e.message : String(e);
      setError(errorMessage);
      addOutput("error", errorMessage);
    }
  };

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    await startSession(prompt().trim());
  };

  const handleCancel = async () => {
    try {
      await cancelClaudeCode();
      setIsRunning(false);
      setPermissionRequest(null);
      setAuthRequest(null);
      setQuestionRequest(null);
      addOutput("text", "--- Session cancelled ---");
    } catch (e) {
      console.error("Failed to cancel:", e);
    }
  };

  const handlePermissionAllow = async () => {
    const req = permissionRequest();
    if (req) {
      await respondClaudeCode({ type: "allow", id: req.id });
      setPermissionRequest(null);
    }
  };

  const handlePermissionDeny = async () => {
    const req = permissionRequest();
    if (req) {
      await respondClaudeCode({ type: "deny", id: req.id });
      setPermissionRequest(null);
    }
  };

  const handleAuthComplete = async () => {
    const req = authRequest();
    if (req) {
      await respondClaudeCode({ type: "auth_complete", id: req.id });
      setAuthRequest(null);
    }
  };

  const handleAuthCancel = async () => {
    await handleCancel();
    setAuthRequest(null);
  };

  const handleQuestionSubmit = async (answer: string) => {
    const req = questionRequest();
    if (req) {
      await respondClaudeCode({ type: "input", id: req.id, text: answer });
      setQuestionRequest(null);
    }
  };

  const handleQuestionCancel = async () => {
    await handleCancel();
    setQuestionRequest(null);
  };

  const toggleMcpServer = (server: string) => {
    setMcpServers((prev) => {
      if (prev.includes(server)) {
        return prev.filter((s) => s !== server);
      }
      return [...prev, server];
    });
  };

  const availableMcpServers = [
    { id: "vercel", name: "Vercel", description: "Deploy and manage Vercel projects" },
    { id: "flyio", name: "Fly.io", description: "Deploy and manage Fly.io apps" },
    { id: "github", name: "GitHub", description: "Interact with GitHub repositories" },
  ];

  return (
    <div class="claude-code-panel">
      <div class="claude-code-header">
        <h2 class="claude-code-title">Claude Code</h2>
        <Show when={props.onClose}>
          <button class="close-btn" onClick={props.onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </Show>
      </div>

      {/* Permission Dialog */}
      <Show when={permissionRequest()}>
        {(req) => (
          <ClaudeCodePermissionDialog
            id={req().id}
            tool={req().tool}
            description={req().description}
            onAllow={handlePermissionAllow}
            onDeny={handlePermissionDeny}
          />
        )}
      </Show>

      {/* Auth Dialog */}
      <Show when={authRequest()}>
        {(req) => (
          <ClaudeCodeAuthDialog
            id={req().id}
            service={req().service}
            url={req().url}
            onComplete={handleAuthComplete}
            onCancel={handleAuthCancel}
          />
        )}
      </Show>

      {/* Question Dialog */}
      <Show when={questionRequest()}>
        {(req) => (
          <ClaudeCodeQuestionDialog
            id={req().id}
            text={req().text}
            options={req().options}
            onSubmit={handleQuestionSubmit}
            onCancel={handleQuestionCancel}
          />
        )}
      </Show>

      {/* Output Area */}
      <div class="claude-code-output" ref={outputRef}>
        <Show
          when={output().length > 0}
          fallback={
            <div class="output-placeholder">
              <p>Enter a prompt to start a Claude Code session.</p>
              <p class="hint">Claude Code will run with access to your local filesystem and any enabled MCP servers.</p>
            </div>
          }
        >
          <For each={output()}>
            {(line) => (
              <div class={`output-line ${line.type}`}>
                <span class="output-content">{line.content}</span>
              </div>
            )}
          </For>
        </Show>
      </div>

      {/* MCP Server Selection */}
      <div class="mcp-server-section">
        <label class="section-label">MCP Servers</label>
        <div class="mcp-server-list">
          <For each={availableMcpServers}>
            {(server) => (
              <button
                class={`mcp-server-chip ${mcpServers().includes(server.id) ? "active" : ""}`}
                onClick={() => toggleMcpServer(server.id)}
                disabled={isRunning()}
                title={server.description}
              >
                {server.name}
              </button>
            )}
          </For>
        </div>
      </div>

      {/* Working Directory */}
      <div class="working-dir-section">
        <label class="section-label">Working Directory (optional)</label>
        <input
          type="text"
          class="working-dir-input"
          placeholder="/path/to/project"
          value={workingDir()}
          onInput={(e) => setWorkingDir(e.currentTarget.value)}
          disabled={isRunning()}
        />
      </div>

      {/* Input Form */}
      <form class="claude-code-input-form" onSubmit={handleSubmit}>
        <textarea
          class="claude-code-input"
          placeholder="Enter your prompt for Claude Code..."
          value={prompt()}
          onInput={(e) => setPrompt(e.currentTarget.value)}
          disabled={isRunning()}
          rows={3}
        />
        <div class="input-actions">
          <Show when={isRunning()}>
            <button
              type="button"
              class="cancel-btn"
              onClick={handleCancel}
            >
              Cancel
            </button>
          </Show>
          <button
            type="submit"
            class="submit-btn"
            disabled={isRunning() || !prompt().trim()}
          >
            {isRunning() ? "Running..." : "Run"}
          </button>
        </div>
      </form>

      {/* Error Display */}
      <Show when={error()}>
        <div class="error-banner">
          <span>{error()}</span>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      </Show>
    </div>
  );
};

export default ClaudeCodePanel;
