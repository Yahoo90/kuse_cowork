import { Component, Show } from "solid-js";
import { open } from "@tauri-apps/plugin-shell";
import "./ClaudeCodePanel.css";

interface Props {
  id: string;
  service: string;
  url?: string;
  onComplete: () => void;
  onCancel: () => void;
}

const ClaudeCodeAuthDialog: Component<Props> = (props) => {
  const handleOpenBrowser = async () => {
    if (props.url) {
      try {
        await open(props.url);
      } catch (e) {
        console.error("Failed to open browser:", e);
      }
    }
  };

  const serviceDisplayName = () => {
    switch (props.service) {
      case "vercel":
        return "Vercel";
      case "flyio":
        return "Fly.io";
      case "github":
        return "GitHub";
      default:
        return props.service;
    }
  };

  return (
    <div class="claude-code-dialog auth-dialog">
      <div class="dialog-header">
        <div class="dialog-icon auth-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h3 class="dialog-title">Authentication Required</h3>
      </div>

      <div class="dialog-content">
        <p class="dialog-message">
          Claude Code needs to authenticate with <strong>{serviceDisplayName()}</strong> to continue.
        </p>
        <Show when={props.url}>
          <p class="dialog-hint">
            Click the button below to open the authentication page in your browser.
          </p>
        </Show>
      </div>

      <div class="dialog-actions">
        <button
          class="dialog-btn cancel-btn"
          onClick={props.onCancel}
        >
          Cancel
        </button>
        <Show when={props.url}>
          <button
            class="dialog-btn browser-btn"
            onClick={handleOpenBrowser}
          >
            Open Browser
          </button>
        </Show>
        <button
          class="dialog-btn complete-btn"
          onClick={props.onComplete}
        >
          I've Completed Auth
        </button>
      </div>
    </div>
  );
};

export default ClaudeCodeAuthDialog;
