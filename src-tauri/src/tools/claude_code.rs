use crate::agent::ToolDefinition;
use serde_json::json;

pub fn definition() -> ToolDefinition {
    ToolDefinition {
        name: "trigger_claude_code".to_string(),
        description: r#"Trigger Claude Code CLI to perform tasks that require:
- Interactive authentication (Vercel, Fly.io, GitHub OAuth)
- MCP server integrations (deployments, cloud services)
- Complex multi-step operations with real CLI tools

Use this tool when the user asks to deploy, authenticate with cloud services, or perform tasks that need the full Claude Code CLI capabilities.

The tool will open the Claude Code panel with your specified prompt and configuration."#.to_string(),
        input_schema: json!({
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "The detailed prompt/instructions for Claude Code to execute. Include all context from the conversation."
                },
                "working_directory": {
                    "type": "string",
                    "description": "The project directory where Claude Code should run (optional)"
                },
                "mcp_servers": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "MCP servers to enable: 'vercel', 'flyio', 'github' (optional)"
                }
            },
            "required": ["prompt"]
        }),
    }
}

pub fn execute(
    input: &serde_json::Value,
    project_path: Option<&str>,
) -> Result<String, String> {
    let prompt = input
        .get("prompt")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'prompt' parameter")?;

    let working_directory = input
        .get("working_directory")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| project_path.map(|s| s.to_string()));

    let mcp_servers: Vec<String> = input
        .get("mcp_servers")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    // Return a structured JSON that the frontend will parse
    let trigger_data = json!({
        "__claude_code_trigger__": true,
        "prompt": prompt,
        "working_directory": working_directory,
        "mcp_servers": mcp_servers
    });

    Ok(trigger_data.to_string())
}
