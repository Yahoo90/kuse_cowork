pub mod bash;
pub mod claude_code;
pub mod docker;
pub mod excel;
pub mod file_edit;
pub mod file_read;
pub mod file_write;
pub mod glob;
pub mod grep;
pub mod list_dir;
pub mod video;

use crate::agent::ToolDefinition;

/// Get all available tool definitions
pub fn get_all_tools() -> Vec<ToolDefinition> {
    let mut tools = vec![
        file_read::definition(),
        file_write::definition(),
        file_edit::definition(),
        bash::definition(),
        glob::definition(),
        grep::definition(),
        list_dir::definition(),
        claude_code::definition(),
    ];

    // Add Docker tools
    tools.extend(docker::get_docker_tools());

    // Add Excel query tools
    tools.extend(excel::get_excel_tools());

    // Add Video editing tools
    tools.extend(video::get_video_tools());

    tools
}

/// Get tool definitions filtered by allowed list
pub fn get_tools(allowed: &[String]) -> Vec<ToolDefinition> {
    get_all_tools()
        .into_iter()
        .filter(|t| allowed.contains(&t.name))
        .collect()
}
