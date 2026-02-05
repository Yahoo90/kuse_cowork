import { Component, For, Show, createSignal } from "solid-js";
import "./ClaudeCodePanel.css";

interface Props {
  id: string;
  text: string;
  options: string[];
  onSubmit: (answer: string) => void;
  onCancel: () => void;
}

const ClaudeCodeQuestionDialog: Component<Props> = (props) => {
  const [answer, setAnswer] = createSignal("");

  const isPressEnterPrompt = () =>
    /press\s+enter|hit\s+enter|enter\s+to\s+continue/i.test(props.text);

  const handleSubmit = () => {
    if (isPressEnterPrompt()) {
      props.onSubmit("");
      return;
    }
    const value = answer().trim();
    if (!value) return;
    props.onSubmit(value);
    setAnswer("");
  };

  return (
    <div class="claude-code-dialog question-dialog">
      <div class="dialog-header">
        <div class="dialog-icon question-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 0 1 5.82 1c0 2-3 2-3 4"/>
            <line x1="12" y1="17" x2="12" y2="17"/>
          </svg>
        </div>
        <h3 class="dialog-title">Input Required</h3>
      </div>

      <div class="dialog-content">
        <p class="dialog-message">{props.text}</p>
      </div>

      <Show
        when={props.options.length > 0}
        fallback={
          <div class="dialog-content">
            <Show when={!isPressEnterPrompt()}>
              <input
                type="text"
                class="dialog-input"
                placeholder="Type your response..."
                value={answer()}
                onInput={(e) => setAnswer(e.currentTarget.value)}
              />
            </Show>
          </div>
        }
      >
        <div class="dialog-actions wrap">
          <For each={props.options}>
            {(option) => (
              <button
                class="dialog-btn option-btn"
                onClick={() => props.onSubmit(option)}
              >
                {option}
              </button>
            )}
          </For>
        </div>
      </Show>

      <div class="dialog-actions">
        <button class="dialog-btn cancel-btn" onClick={props.onCancel}>
          Cancel
        </button>
        <Show when={props.options.length === 0}>
          <button class="dialog-btn allow-btn" onClick={handleSubmit}>
            {isPressEnterPrompt() ? "Continue" : "Submit"}
          </button>
        </Show>
      </div>
    </div>
  );
};

export default ClaudeCodeQuestionDialog;
