use super::parser::{OutputParser, ParsedOutput};
use super::types::{
    ClaudeCodeEvent, ClaudeCodeRequest, ClaudeCodeResponse, ClaudeCodeStatus, PendingPrompt,
    PendingPromptType,
};
use portable_pty::{native_pty_system, CommandBuilder, PtySize, Child};
use std::env;
use std::io::{Read, Write};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tempfile::{NamedTempFile, TempPath};
use tokio::sync::{mpsc, Mutex, RwLock};
use uuid::Uuid;

/// Get the path to the claude CLI binary
fn get_claude_path() -> String {
    // Check common installation locations on macOS
    let home = env::var("HOME").unwrap_or_default();

    let common_paths = [
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        &format!("{}/.local/bin/claude", home),
        &format!("{}/.npm-global/bin/claude", home),
        &format!("{}/.nvm/versions/node/*/bin/claude", home), // nvm installations
    ];

    for path in common_paths.iter() {
        // Handle glob pattern for nvm
        if path.contains('*') {
            if let Ok(entries) = glob::glob(path) {
                for entry in entries.flatten() {
                    if entry.exists() {
                        return entry.to_string_lossy().to_string();
                    }
                }
            }
        } else if std::path::Path::new(path).exists() {
            return path.to_string();
        }
    }

    // Fall back to just "claude" and hope it's in PATH
    "claude".to_string()
}

/// Get an extended PATH that includes common binary locations
fn get_extended_path() -> String {
    let current_path = env::var("PATH").unwrap_or_default();
    let home = env::var("HOME").unwrap_or_default();

    let local_bin = format!("{}/.local/bin", home);
    let npm_bin = format!("{}/.npm-global/bin", home);
    let nvm_glob = format!("{}/.nvm/versions/node/*/bin", home);

    let mut additional_paths = vec![
        "/usr/local/bin".to_string(),
        "/opt/homebrew/bin".to_string(),
        local_bin,
        npm_bin,
        "/usr/bin".to_string(),
        "/bin".to_string(),
    ];

    if let Ok(entries) = glob::glob(&nvm_glob) {
        for entry in entries.flatten() {
            additional_paths.push(entry.to_string_lossy().to_string());
        }
    }

    let mut all_paths: Vec<String> = additional_paths;
    all_paths.push(current_path);

    all_paths.join(":")
}

/// Build MCP config JSON for the specified servers
fn build_mcp_config_json(servers: &[String]) -> Option<String> {
    if servers.is_empty() {
        return None;
    }

    let mut mcp_servers = serde_json::Map::new();

    for server in servers {
        let (name, command, args) = match server.as_str() {
            "vercel" => ("vercel", "npx", vec!["-y", "@vercel/mcp@latest"]),
            "flyio" => ("flyio", "npx", vec!["-y", "@anthropic-ai/mcp-server-flyio"]),
            "github" => (
                "github",
                "npx",
                vec!["-y", "@modelcontextprotocol/server-github"],
            ),
            _ => {
                eprintln!("Unknown MCP server: {}", server);
                continue;
            }
        };

        let server_config = serde_json::json!({
            "command": command,
            "args": args
        });
        mcp_servers.insert(name.to_string(), server_config);
    }

    if mcp_servers.is_empty() {
        return None;
    }

    let config = serde_json::json!({
        "mcpServers": mcp_servers
    });

    Some(config.to_string())
}

/// Manager for Claude Code CLI PTY sessions
pub struct ClaudeCodeManager {
    status: Arc<RwLock<ClaudeCodeStatus>>,
    pending_prompts: Arc<RwLock<Vec<PendingPrompt>>>,
    pty_writer: Arc<Mutex<Option<Box<dyn Write + Send>>>>,
    child_process: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>>,
    cancel_tx: Arc<Mutex<Option<mpsc::Sender<()>>>>,
    mcp_config_path: Arc<Mutex<Option<TempPath>>>,
}

impl ClaudeCodeManager {
    pub fn new() -> Self {
        Self {
            status: Arc::new(RwLock::new(ClaudeCodeStatus::Idle)),
            pending_prompts: Arc::new(RwLock::new(Vec::new())),
            pty_writer: Arc::new(Mutex::new(None)),
            child_process: Arc::new(Mutex::new(None)),
            cancel_tx: Arc::new(Mutex::new(None)),
            mcp_config_path: Arc::new(Mutex::new(None)),
        }
    }

    /// Start a new Claude Code session with interactive PTY
    pub async fn start_session(
        &self,
        app_handle: AppHandle,
        request: ClaudeCodeRequest,
    ) -> Result<String, String> {
        // Check if already running
        {
            let status = self.status.read().await;
            if *status == ClaudeCodeStatus::Running {
                return Err("A Claude Code session is already running".to_string());
            }
        }

        // Create PTY for interactive session
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 50,
                cols: 200,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        // Build claude command - interactive mode (no --print flag)
        let claude_path = get_claude_path();
        eprintln!("[ClaudeCode] Using claude path: {}", claude_path);

        let mut cmd = CommandBuilder::new(&claude_path);

        // Set extended PATH
        cmd.env("PATH", get_extended_path());

        // Set terminal type - xterm-256color works well with most CLIs
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        // Collect all arguments
        let mut args: Vec<String> = Vec::new();

        // Prefer non-TUI output while keeping PTY for input prompts
        args.push("--print".to_string());

        // Add MCP config if servers specified (write to temp file for CLI compatibility)
        if let Some(mcp_config) = build_mcp_config_json(&request.mcp_servers) {
            let mut file = NamedTempFile::new()
                .map_err(|e| format!("Failed to create MCP temp file: {}", e))?;
            file.write_all(mcp_config.as_bytes())
                .map_err(|e| format!("Failed to write MCP config: {}", e))?;
            let temp_path = file.into_temp_path();
            let path_str = temp_path.to_string_lossy().to_string();
            {
                let mut guard = self.mcp_config_path.lock().await;
                *guard = Some(temp_path);
            }
            args.push("--mcp-config".to_string());
            args.push(path_str);
        }

        eprintln!("[ClaudeCode] Command args: {:?}", args);

        // Add all arguments
        for arg in &args {
            cmd.arg(arg);
        }

        // Set working directory
        if let Some(ref dir) = request.working_directory {
            eprintln!("[ClaudeCode] Working directory: {}", dir);
            cmd.cwd(dir);
        }

        // Spawn the process in the PTY
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn claude: {}", e))?;

        // Get reader and writer from master
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take writer: {}", e))?;

        // Store writer for sending responses to prompts
        {
            let mut pty_writer_guard = self.pty_writer.lock().await;
            *pty_writer_guard = Some(writer);
        }

        // Store child process
        {
            let mut child_proc = self.child_process.lock().await;
            *child_proc = Some(child);
        }

        // Create cancellation channel
        let (cancel_tx, mut cancel_rx) = mpsc::channel::<()>(1);
        {
            let mut tx = self.cancel_tx.lock().await;
            *tx = Some(cancel_tx);
        }

        // Update status
        {
            let mut status = self.status.write().await;
            *status = ClaudeCodeStatus::Running;
        }

        let session_id = Uuid::new_v4().to_string();

        // Spawn reader task
        let status_clone = self.status.clone();
        let pending_prompts_clone = self.pending_prompts.clone();
        let app_handle_clone = app_handle.clone();
        let mcp_config_path_clone = self.mcp_config_path.clone();

        std::thread::spawn(move || {
            eprintln!("[ClaudeCode] Reader thread started");
            let parser = OutputParser::new();
            let mut reader = reader;
            let mut buffer = [0u8; 4096];
            let mut line_buffer = String::new();

            loop {
                // Check for cancellation (non-blocking)
                if cancel_rx.try_recv().is_ok() {
                    eprintln!("[ClaudeCode] Cancellation received");
                    break;
                }

                // Read from PTY
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        // EOF - process ended
                        eprintln!("[ClaudeCode] EOF - process ended");
                        break;
                    }
                    Ok(n) => {
                        // Convert bytes to string and strip ANSI escapes
                        let chunk = String::from_utf8_lossy(&buffer[..n]);
                        let preview: String = chunk.chars().take(200).collect();
                        eprintln!("[ClaudeCode] Read {} bytes: {:?}", n, preview);
                        let clean_chunk = strip_ansi_escapes::strip_str(&chunk);

                        // Add to line buffer
                        line_buffer.push_str(&clean_chunk);

                        // Process complete lines
                        while let Some(newline_pos) = line_buffer.find('\n') {
                            let line = line_buffer[..newline_pos].to_string();
                            line_buffer = line_buffer[newline_pos + 1..].to_string();

                            let trimmed = line.trim();
                            if trimmed.is_empty() {
                                continue;
                            }

                            // Parse the line
                            if let Some(parsed) = parser.parse_line(trimmed) {
                                let event = Self::parsed_to_event(
                                    parsed,
                                    &status_clone,
                                    &pending_prompts_clone,
                                );

                                // Emit event to frontend
                                eprintln!("[ClaudeCode] Emitting event: {:?}", &event);
                                if let Err(e) = app_handle_clone.emit("claude-code-event", &event) {
                                    eprintln!("[ClaudeCode] Failed to emit event: {}", e);
                                }
                            }
                        }

                        // Also check for prompts in partial line (prompts may not end with newline)
                        if !line_buffer.is_empty() {
                            let trimmed = line_buffer.trim();
                            if parser.is_prompt(trimmed) {
                                if let Some(parsed) = parser.parse_line(trimmed) {
                                    let event = Self::parsed_to_event(
                                        parsed,
                                        &status_clone,
                                        &pending_prompts_clone,
                                    );
                                    let _ = app_handle_clone.emit("claude-code-event", &event);
                                    line_buffer.clear();
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("Error reading PTY: {}", e);
                        break;
                    }
                }
            }

            // Session ended - update status
            if let Ok(mut status) = status_clone.try_write() {
                if *status == ClaudeCodeStatus::Running {
                    *status = ClaudeCodeStatus::Completed;
                    let _ = app_handle_clone.emit("claude-code-event", &ClaudeCodeEvent::Done);
                }
            }

            // Drop temp MCP config file
            if let Ok(mut guard) = mcp_config_path_clone.try_write() {
                *guard = None;
            }
        });

        Ok(session_id)
    }

    /// Convert ParsedOutput to ClaudeCodeEvent, updating state for prompts
    fn parsed_to_event(
        parsed: ParsedOutput,
        status: &Arc<RwLock<ClaudeCodeStatus>>,
        pending_prompts: &Arc<RwLock<Vec<PendingPrompt>>>,
    ) -> ClaudeCodeEvent {
        match parsed {
            ParsedOutput::Text(content) => ClaudeCodeEvent::Output { content },
            ParsedOutput::ToolUse { name, input } => {
                ClaudeCodeEvent::ToolUse { tool: name, input }
            }
            ParsedOutput::PermissionRequest { tool, description } => {
                let id = Uuid::new_v4().to_string();

                let pending = PendingPrompt {
                    id: id.clone(),
                    prompt_type: PendingPromptType::Permission {
                        tool: tool.clone(),
                        description: description.clone(),
                    },
                    created_at: std::time::Instant::now(),
                };

                if let Ok(mut prompts) = pending_prompts.try_write() {
                    prompts.push(pending);
                }

                if let Ok(mut s) = status.try_write() {
                    *s = ClaudeCodeStatus::WaitingForInput {
                        request_id: id.clone(),
                    };
                }

                ClaudeCodeEvent::PermissionRequest { id, tool, description }
            }
            ParsedOutput::AuthRequired { service, url } => {
                let id = Uuid::new_v4().to_string();

                let pending = PendingPrompt {
                    id: id.clone(),
                    prompt_type: PendingPromptType::Auth {
                        service: service.clone(),
                        url: url.clone(),
                    },
                    created_at: std::time::Instant::now(),
                };

                if let Ok(mut prompts) = pending_prompts.try_write() {
                    prompts.push(pending);
                }

                if let Ok(mut s) = status.try_write() {
                    *s = ClaudeCodeStatus::WaitingForInput {
                        request_id: id.clone(),
                    };
                }

                ClaudeCodeEvent::AuthRequired { id, service, url }
            }
            ParsedOutput::Question { text, options } => {
                let id = Uuid::new_v4().to_string();

                let pending = PendingPrompt {
                    id: id.clone(),
                    prompt_type: PendingPromptType::Question {
                        text: text.clone(),
                        options: options.clone(),
                    },
                    created_at: std::time::Instant::now(),
                };

                if let Ok(mut prompts) = pending_prompts.try_write() {
                    prompts.push(pending);
                }

                if let Ok(mut s) = status.try_write() {
                    *s = ClaudeCodeStatus::WaitingForInput {
                        request_id: id.clone(),
                    };
                }

                ClaudeCodeEvent::Question { id, text, options }
            }
            ParsedOutput::Done => {
                if let Ok(mut s) = status.try_write() {
                    *s = ClaudeCodeStatus::Completed;
                }
                ClaudeCodeEvent::Done
            }
            ParsedOutput::Error(message) => {
                if let Ok(mut s) = status.try_write() {
                    *s = ClaudeCodeStatus::Error;
                }
                ClaudeCodeEvent::Error { message }
            }
        }
    }

    /// Respond to a pending prompt by writing to PTY stdin
    pub async fn respond(&self, response: ClaudeCodeResponse) -> Result<(), String> {
        match response {
            ClaudeCodeResponse::Allow { id } => {
                let reply = self.permission_reply(&id, true).await;
                self.write_to_pty(&reply).await?;
                self.remove_pending_prompt(&id).await;
                self.update_status_to_running().await;
            }
            ClaudeCodeResponse::Deny { id } => {
                let reply = self.permission_reply(&id, false).await;
                self.write_to_pty(&reply).await?;
                self.remove_pending_prompt(&id).await;
                self.update_status_to_running().await;
            }
            ClaudeCodeResponse::AuthComplete { id } => {
                // For auth, user completed in browser, send Enter to continue
                self.write_to_pty("\n").await?;
                self.remove_pending_prompt(&id).await;
                self.update_status_to_running().await;
            }
            ClaudeCodeResponse::Input { id, text } => {
                self.write_to_pty(&format!("{}\n", text)).await?;
                self.remove_pending_prompt(&id).await;
                self.update_status_to_running().await;
            }
            ClaudeCodeResponse::Cancel => {
                self.cancel().await?;
            }
        }
        Ok(())
    }

    /// Write input to the PTY
    async fn write_to_pty(&self, input: &str) -> Result<(), String> {
        let mut writer_guard = self.pty_writer.lock().await;
        if let Some(ref mut writer) = *writer_guard {
            writer
                .write_all(input.as_bytes())
                .map_err(|e| format!("Failed to write to PTY: {}", e))?;
            writer
                .flush()
                .map_err(|e| format!("Failed to flush PTY: {}", e))?;
            Ok(())
        } else {
            Err("No active PTY session".to_string())
        }
    }

    /// Find pending prompt by id
    async fn find_pending_prompt(&self, id: &str) -> Option<PendingPrompt> {
        let prompts = self.pending_prompts.read().await;
        prompts.iter().find(|p| p.id == id).cloned()
    }

    /// Choose a permission reply based on the original prompt text
    async fn permission_reply(&self, id: &str, allow: bool) -> String {
        let prompt = self.find_pending_prompt(id).await;

        if let Some(PendingPrompt {
            prompt_type: PendingPromptType::Permission { description, .. },
            ..
        }) = prompt
        {
            return Self::select_permission_reply(&description, allow);
        }

        if allow {
            "y\n".to_string()
        } else {
            "n\n".to_string()
        }
    }

    /// Select reply token for common permission prompt formats
    fn select_permission_reply(description: &str, allow: bool) -> String {
        let desc = description.to_lowercase();
        let token = if desc.contains("allow/deny") || desc.contains("[allow/deny]") {
            if allow { "allow" } else { "deny" }
        } else if desc.contains("yes/no") || desc.contains("[yes/no]") {
            if allow { "yes" } else { "no" }
        } else if desc.contains("y/n") || desc.contains("[y/n]") || desc.contains("(y/n)") {
            if allow { "y" } else { "n" }
        } else {
            if allow { "y" } else { "n" }
        };

        format!("{}\n", token)
    }

    /// Remove a pending prompt by ID
    async fn remove_pending_prompt(&self, id: &str) {
        let mut prompts = self.pending_prompts.write().await;
        prompts.retain(|p| p.id != id);
    }

    /// Update status back to running after responding
    async fn update_status_to_running(&self) {
        let mut status = self.status.write().await;
        if matches!(*status, ClaudeCodeStatus::WaitingForInput { .. }) {
            *status = ClaudeCodeStatus::Running;
        }
    }

    /// Cancel the current session
    pub async fn cancel(&self) -> Result<(), String> {
        // Send Ctrl+C to the PTY
        if let Err(e) = self.write_to_pty("\x03").await {
            eprintln!("Failed to send Ctrl+C: {}", e);
        }

        // Send cancel signal to reader thread
        if let Some(tx) = self.cancel_tx.lock().await.take() {
            let _ = tx.send(()).await;
        }

        // Kill the child process
        if let Some(mut child) = self.child_process.lock().await.take() {
            let _ = child.kill();
        }

        // Clear PTY writer
        {
            let mut writer = self.pty_writer.lock().await;
            *writer = None;
        }

        // Clear state
        {
            let mut prompts = self.pending_prompts.write().await;
            prompts.clear();
        }
        {
            let mut path = self.mcp_config_path.lock().await;
            *path = None;
        }
        {
            let mut status = self.status.write().await;
            *status = ClaudeCodeStatus::Idle;
        }

        Ok(())
    }

    /// Get the current status
    pub async fn get_status(&self) -> ClaudeCodeStatus {
        self.status.read().await.clone()
    }
}

impl Default for ClaudeCodeManager {
    fn default() -> Self {
        Self::new()
    }
}
