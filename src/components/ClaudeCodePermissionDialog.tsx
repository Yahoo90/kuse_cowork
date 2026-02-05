import { Component } from "solid-js";
import "./ClaudeCodePanel.css";

interface Props {
  id: string;
  tool: string;
  description: string;
  onAllow: () => void;
  onDeny: () => void;
}

const ClaudeCodePermissionDialog: Component<Props> = (props) => {
  return (
    <div class="claude-code-dialog permission-dialog">
      <div class="dialog-header">
        <div class="dialog-icon permission-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <h3 class="dialog-title">Permission Request</h3>
      </div>

      <div class="dialog-content">
        <p class="dialog-message">
          Claude Code wants to use the <strong>{props.tool}</strong> tool:
        </p>
        <div class="dialog-description">
          <code>{props.description}</code>
        </div>
      </div>

      <div class="dialog-actions">
        <button
          class="dialog-btn deny-btn"
          onClick={props.onDeny}
        >
          Deny
        </button>
        <button
          class="dialog-btn allow-btn"
          onClick={props.onAllow}
        >
          Allow
        </button>
      </div>
    </div>
  );
};

export default ClaudeCodePermissionDialog;
