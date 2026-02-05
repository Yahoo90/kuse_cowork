use crate::agent::{ToolDefinition, ToolResult, ToolUse};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::{Path, PathBuf};
use std::process::Command;

/// Video metadata information
#[derive(Debug, Serialize, Deserialize)]
pub struct VideoInfo {
    pub path: String,
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub audio_codec: Option<String>,
    pub bitrate: Option<u64>,
    pub format: String,
}

/// Scene analysis result
#[derive(Debug, Serialize, Deserialize)]
pub struct SceneInfo {
    pub start_time: f64,
    pub end_time: f64,
    pub description: String,
    pub suggested_action: String,
    pub confidence: f64,
}

/// Analysis result with scenes and recommendations
#[derive(Debug, Serialize, Deserialize)]
pub struct AnalysisResult {
    pub scenes: Vec<SceneInfo>,
    pub recommended_edits: Vec<RecommendedEdit>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RecommendedEdit {
    pub edit_type: String,
    pub start: f64,
    pub end: f64,
    pub reason: String,
}

/// Extracted frame information
#[derive(Debug, Serialize, Deserialize)]
pub struct ExtractedFrame {
    pub index: usize,
    pub timestamp: f64,
    pub path: String,
    pub base64: Option<String>,
}

/// Get all video tool definitions
pub fn get_video_tools() -> Vec<ToolDefinition> {
    vec![
        ToolDefinition {
            name: "video_info".to_string(),
            description: "Get metadata about a video file including duration, resolution, fps, codec, and format.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the video file"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "video_extract_frames".to_string(),
            description: "Extract frames from a video at regular intervals. Returns paths to extracted frame images and optionally base64-encoded data for vision analysis.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the video file"
                    },
                    "interval_seconds": {
                        "type": "number",
                        "description": "Interval between frames in seconds (default: 5.0)"
                    },
                    "max_frames": {
                        "type": "integer",
                        "description": "Maximum number of frames to extract (default: 10)"
                    },
                    "include_base64": {
                        "type": "boolean",
                        "description": "Include base64-encoded image data for vision analysis (default: false)"
                    }
                },
                "required": ["path"]
            }),
        },
        ToolDefinition {
            name: "video_analyze_scene".to_string(),
            description: "Analyze video content using extracted frames. Provide frame indices and get scene descriptions. This tool requires frames to be extracted first using video_extract_frames.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "video_path": {
                        "type": "string",
                        "description": "Path to the original video file"
                    },
                    "frame_paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Paths to extracted frame images to analyze"
                    },
                    "timestamps": {
                        "type": "array",
                        "items": { "type": "number" },
                        "description": "Timestamps corresponding to each frame"
                    }
                },
                "required": ["video_path", "frame_paths", "timestamps"]
            }),
        },
        ToolDefinition {
            name: "video_cut".to_string(),
            description: "Extract a segment from a video. Creates a new video file containing only the specified time range.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the input video file"
                    },
                    "start_time": {
                        "type": "number",
                        "description": "Start time in seconds"
                    },
                    "end_time": {
                        "type": "number",
                        "description": "End time in seconds"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Path for the output video file (optional, auto-generated if not provided)"
                    }
                },
                "required": ["path", "start_time", "end_time"]
            }),
        },
        ToolDefinition {
            name: "video_trim".to_string(),
            description: "Remove a segment from a video. Creates a new video with the specified time range removed.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the input video file"
                    },
                    "start_time": {
                        "type": "number",
                        "description": "Start time of segment to remove (in seconds)"
                    },
                    "end_time": {
                        "type": "number",
                        "description": "End time of segment to remove (in seconds)"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Path for the output video file (optional, auto-generated if not provided)"
                    }
                },
                "required": ["path", "start_time", "end_time"]
            }),
        },
        ToolDefinition {
            name: "video_merge".to_string(),
            description: "Concatenate multiple videos into a single video file. Videos should have compatible formats.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "paths": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Paths to video files to merge, in order"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Path for the output video file"
                    }
                },
                "required": ["paths", "output_path"]
            }),
        },
        ToolDefinition {
            name: "video_add_transition".to_string(),
            description: "Add a transition effect (fade in/out) to a video.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the input video file"
                    },
                    "transition_type": {
                        "type": "string",
                        "enum": ["fade_in", "fade_out", "fade_both"],
                        "description": "Type of transition to apply"
                    },
                    "duration": {
                        "type": "number",
                        "description": "Duration of the transition in seconds (default: 1.0)"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "Path for the output video file (optional, auto-generated if not provided)"
                    }
                },
                "required": ["path", "transition_type"]
            }),
        },
    ]
}

/// Execute a video tool
pub fn execute_video_tool(tool_use: &ToolUse, project_path: &Option<String>) -> ToolResult {
    let project_path_str = project_path.as_deref();
    let result = match tool_use.name.as_str() {
        "video_info" => execute_video_info(&tool_use.input, project_path_str),
        "video_extract_frames" => execute_extract_frames(&tool_use.input, project_path_str),
        "video_analyze_scene" => execute_analyze_scene(&tool_use.input, project_path_str),
        "video_cut" => execute_video_cut(&tool_use.input, project_path_str),
        "video_trim" => execute_video_trim(&tool_use.input, project_path_str),
        "video_merge" => execute_video_merge(&tool_use.input, project_path_str),
        "video_add_transition" => execute_add_transition(&tool_use.input, project_path_str),
        _ => Err(format!("Unknown video tool: {}", tool_use.name)),
    };

    match result {
        Ok(content) => ToolResult::success(tool_use.id.clone(), content),
        Err(error) => ToolResult::error(tool_use.id.clone(), error),
    }
}

/// Check if FFmpeg is available
fn check_ffmpeg() -> Result<(), String> {
    Command::new("ffmpeg")
        .arg("-version")
        .output()
        .map_err(|_| "FFmpeg not found. Please install FFmpeg to use video tools.".to_string())?;
    Ok(())
}

/// Check if FFprobe is available
fn check_ffprobe() -> Result<(), String> {
    Command::new("ffprobe")
        .arg("-version")
        .output()
        .map_err(|_| "FFprobe not found. Please install FFmpeg to use video tools.".to_string())?;
    Ok(())
}

/// Resolve a path, expanding home directory and making it absolute
fn resolve_path(path_str: &str, project_path: Option<&str>) -> Result<PathBuf, String> {
    let path = if path_str.starts_with("~/") {
        let home = dirs::home_dir().ok_or("Could not determine home directory")?;
        home.join(&path_str[2..])
    } else if Path::new(path_str).is_absolute() {
        PathBuf::from(path_str)
    } else if let Some(project) = project_path {
        PathBuf::from(project).join(path_str)
    } else {
        PathBuf::from(path_str)
    };

    Ok(path)
}

/// Generate output path for video operations
fn generate_output_path(input_path: &Path, suffix: &str) -> PathBuf {
    let stem = input_path.file_stem().unwrap_or_default().to_string_lossy();
    let ext = input_path.extension().unwrap_or_default().to_string_lossy();
    let parent = input_path.parent().unwrap_or(Path::new("."));
    parent.join(format!("{}_{}.{}", stem, suffix, ext))
}

/// Get video information using FFprobe
fn execute_video_info(
    input: &serde_json::Value,
    project_path: Option<&str>,
) -> Result<String, String> {
    check_ffprobe()?;

    let path_str = input
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'path' parameter")?;

    let path = resolve_path(path_str, project_path)?;

    if !path.exists() {
        return Err(format!("Video file not found: {}", path.display()));
    }

    // Run ffprobe to get video info as JSON
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "FFprobe failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let probe_output: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    // Extract video stream info
    let streams = probe_output
        .get("streams")
        .and_then(|s| s.as_array())
        .ok_or("No streams found in video")?;

    let video_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|t| t.as_str()) == Some("video"))
        .ok_or("No video stream found")?;

    let audio_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|t| t.as_str()) == Some("audio"));

    let format = probe_output.get("format").ok_or("No format info found")?;

    // Parse fps from avg_frame_rate (e.g., "30/1" or "30000/1001")
    let fps = video_stream
        .get("avg_frame_rate")
        .and_then(|f| f.as_str())
        .map(|fps_str| {
            let parts: Vec<&str> = fps_str.split('/').collect();
            if parts.len() == 2 {
                let num: f64 = parts[0].parse().unwrap_or(0.0);
                let den: f64 = parts[1].parse().unwrap_or(1.0);
                if den > 0.0 {
                    num / den
                } else {
                    0.0
                }
            } else {
                fps_str.parse().unwrap_or(0.0)
            }
        })
        .unwrap_or(0.0);

    let info = VideoInfo {
        path: path.display().to_string(),
        duration: format
            .get("duration")
            .and_then(|d| d.as_str())
            .and_then(|d| d.parse().ok())
            .unwrap_or(0.0),
        width: video_stream
            .get("width")
            .and_then(|w| w.as_u64())
            .unwrap_or(0) as u32,
        height: video_stream
            .get("height")
            .and_then(|h| h.as_u64())
            .unwrap_or(0) as u32,
        fps,
        codec: video_stream
            .get("codec_name")
            .and_then(|c| c.as_str())
            .unwrap_or("unknown")
            .to_string(),
        audio_codec: audio_stream
            .and_then(|a| a.get("codec_name"))
            .and_then(|c| c.as_str())
            .map(|s| s.to_string()),
        bitrate: format
            .get("bit_rate")
            .and_then(|b| b.as_str())
            .and_then(|b| b.parse().ok()),
        format: format
            .get("format_name")
            .and_then(|f| f.as_str())
            .unwrap_or("unknown")
            .to_string(),
    };

    serde_json::to_string_pretty(&info).map_err(|e| format!("Failed to serialize video info: {}", e))
}

/// Extract frames from video
fn execute_extract_frames(
    input: &serde_json::Value,
    project_path: Option<&str>,
) -> Result<String, String> {
    check_ffmpeg()?;

    let path_str = input
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'path' parameter")?;

    let interval = input
        .get("interval_seconds")
        .and_then(|v| v.as_f64())
        .unwrap_or(5.0);

    let max_frames = input
        .get("max_frames")
        .and_then(|v| v.as_u64())
        .unwrap_or(10) as usize;

    let include_base64 = input
        .get("include_base64")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let path = resolve_path(path_str, project_path)?;

    if !path.exists() {
        return Err(format!("Video file not found: {}", path.display()));
    }

    // Create temp directory for frames
    let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_path = temp_dir.path();

    // Get video duration first
    let duration_output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to get video duration: {}", e))?;

    let duration: f64 = String::from_utf8_lossy(&duration_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0.0);

    if duration == 0.0 {
        return Err("Could not determine video duration".to_string());
    }

    // Calculate frame timestamps
    let mut timestamps: Vec<f64> = Vec::new();
    let mut t = 0.0;
    while t < duration && timestamps.len() < max_frames {
        timestamps.push(t);
        t += interval;
    }

    // Extract frames
    let mut extracted_frames: Vec<ExtractedFrame> = Vec::new();

    for (index, &timestamp) in timestamps.iter().enumerate() {
        let frame_path = temp_path.join(format!("frame_{:04}.jpg", index));

        let output = Command::new("ffmpeg")
            .args([
                "-ss",
                &format!("{:.3}", timestamp),
                "-i",
                path.to_str().unwrap(),
                "-vframes",
                "1",
                "-q:v",
                "2",
                "-y",
                frame_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| format!("Failed to extract frame at {}: {}", timestamp, e))?;

        if !output.status.success() {
            continue; // Skip failed frames
        }

        let base64_data = if include_base64 {
            std::fs::read(&frame_path)
                .ok()
                .map(|data| BASE64.encode(&data))
        } else {
            None
        };

        // Copy frame to a persistent location
        let persistent_path = std::env::temp_dir().join(format!(
            "kuse_video_frame_{}_{:04}.jpg",
            std::process::id(),
            index
        ));
        std::fs::copy(&frame_path, &persistent_path).ok();

        extracted_frames.push(ExtractedFrame {
            index,
            timestamp,
            path: persistent_path.display().to_string(),
            base64: base64_data,
        });
    }

    if extracted_frames.is_empty() {
        return Err("Failed to extract any frames from video".to_string());
    }

    serde_json::to_string_pretty(&extracted_frames)
        .map_err(|e| format!("Failed to serialize frames: {}", e))
}

/// Analyze scenes (returns frame info for LLM to process)
fn execute_analyze_scene(
    input: &serde_json::Value,
    _project_path: Option<&str>,
) -> Result<String, String> {
    let video_path = input
        .get("video_path")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'video_path' parameter")?;

    let frame_paths = input
        .get("frame_paths")
        .and_then(|v| v.as_array())
        .ok_or("Missing 'frame_paths' parameter")?;

    let timestamps = input
        .get("timestamps")
        .and_then(|v| v.as_array())
        .ok_or("Missing 'timestamps' parameter")?;

    if frame_paths.len() != timestamps.len() {
        return Err("frame_paths and timestamps must have the same length".to_string());
    }

    // Read frames and encode as base64 for vision analysis
    let mut frames_data: Vec<serde_json::Value> = Vec::new();

    for (i, frame_path) in frame_paths.iter().enumerate() {
        let path_str = frame_path.as_str().ok_or("Invalid frame path")?;
        let timestamp = timestamps[i].as_f64().unwrap_or(0.0);

        let path = PathBuf::from(path_str);
        if !path.exists() {
            continue;
        }

        let image_data = std::fs::read(&path)
            .map_err(|e| format!("Failed to read frame {}: {}", path_str, e))?;
        let base64_data = BASE64.encode(&image_data);

        frames_data.push(json!({
            "index": i,
            "timestamp": timestamp,
            "path": path_str,
            "base64": base64_data,
            "mime_type": "image/jpeg"
        }));
    }

    let result = json!({
        "video_path": video_path,
        "frames": frames_data,
        "instruction": "Analyze these video frames and describe what you see. Identify distinct scenes, transitions, and any segments that might benefit from editing (poor quality, redundant content, etc.). Provide timestamps and descriptions for each scene."
    });

    serde_json::to_string_pretty(&result).map_err(|e| format!("Failed to serialize: {}", e))
}

/// Cut a segment from video
fn execute_video_cut(
    input: &serde_json::Value,
    project_path: Option<&str>,
) -> Result<String, String> {
    check_ffmpeg()?;

    let path_str = input
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'path' parameter")?;

    let start_time = input
        .get("start_time")
        .and_then(|v| v.as_f64())
        .ok_or("Missing 'start_time' parameter")?;

    let end_time = input
        .get("end_time")
        .and_then(|v| v.as_f64())
        .ok_or("Missing 'end_time' parameter")?;

    let path = resolve_path(path_str, project_path)?;

    if !path.exists() {
        return Err(format!("Video file not found: {}", path.display()));
    }

    let output_path = if let Some(out) = input.get("output_path").and_then(|v| v.as_str()) {
        resolve_path(out, project_path)?
    } else {
        generate_output_path(&path, &format!("cut_{:.0}_{:.0}", start_time, end_time))
    };

    let duration = end_time - start_time;
    if duration <= 0.0 {
        return Err("end_time must be greater than start_time".to_string());
    }

    let output = Command::new("ffmpeg")
        .args([
            "-i",
            path.to_str().unwrap(),
            "-ss",
            &format!("{:.3}", start_time),
            "-t",
            &format!("{:.3}", duration),
            "-c",
            "copy",
            "-y",
            output_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "FFmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(json!({
        "success": true,
        "output_path": output_path.display().to_string(),
        "start_time": start_time,
        "end_time": end_time,
        "duration": duration
    })
    .to_string())
}

/// Trim (remove) a segment from video
fn execute_video_trim(
    input: &serde_json::Value,
    project_path: Option<&str>,
) -> Result<String, String> {
    check_ffmpeg()?;

    let path_str = input
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'path' parameter")?;

    let start_time = input
        .get("start_time")
        .and_then(|v| v.as_f64())
        .ok_or("Missing 'start_time' parameter")?;

    let end_time = input
        .get("end_time")
        .and_then(|v| v.as_f64())
        .ok_or("Missing 'end_time' parameter")?;

    let path = resolve_path(path_str, project_path)?;

    if !path.exists() {
        return Err(format!("Video file not found: {}", path.display()));
    }

    let output_path = if let Some(out) = input.get("output_path").and_then(|v| v.as_str()) {
        resolve_path(out, project_path)?
    } else {
        generate_output_path(&path, &format!("trim_{:.0}_{:.0}", start_time, end_time))
    };

    // Get video duration
    let duration_output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to get video duration: {}", e))?;

    let total_duration: f64 = String::from_utf8_lossy(&duration_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0.0);

    // Create temp files for the two parts
    let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let part1_path = temp_dir.path().join("part1.mp4");
    let part2_path = temp_dir.path().join("part2.mp4");
    let concat_file = temp_dir.path().join("concat.txt");

    // Extract part before the trim point
    if start_time > 0.0 {
        let output = Command::new("ffmpeg")
            .args([
                "-i",
                path.to_str().unwrap(),
                "-t",
                &format!("{:.3}", start_time),
                "-c",
                "copy",
                "-y",
                part1_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| format!("Failed to extract first part: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to extract first part: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    // Extract part after the trim point
    if end_time < total_duration {
        let output = Command::new("ffmpeg")
            .args([
                "-i",
                path.to_str().unwrap(),
                "-ss",
                &format!("{:.3}", end_time),
                "-c",
                "copy",
                "-y",
                part2_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| format!("Failed to extract second part: {}", e))?;

        if !output.status.success() {
            return Err(format!(
                "Failed to extract second part: {}",
                String::from_utf8_lossy(&output.stderr)
            ));
        }
    }

    // Create concat file
    let mut concat_content = String::new();
    if start_time > 0.0 && part1_path.exists() {
        concat_content.push_str(&format!("file '{}'\n", part1_path.display()));
    }
    if end_time < total_duration && part2_path.exists() {
        concat_content.push_str(&format!("file '{}'\n", part2_path.display()));
    }

    if concat_content.is_empty() {
        return Err("Nothing to concatenate - trim would remove entire video".to_string());
    }

    std::fs::write(&concat_file, &concat_content)
        .map_err(|e| format!("Failed to write concat file: {}", e))?;

    // Concatenate parts
    let output = Command::new("ffmpeg")
        .args([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concat_file.to_str().unwrap(),
            "-c",
            "copy",
            "-y",
            output_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to concatenate parts: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "Failed to concatenate parts: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let removed_duration = end_time - start_time;

    Ok(json!({
        "success": true,
        "output_path": output_path.display().to_string(),
        "removed_start": start_time,
        "removed_end": end_time,
        "removed_duration": removed_duration,
        "new_duration": total_duration - removed_duration
    })
    .to_string())
}

/// Merge multiple videos
fn execute_video_merge(
    input: &serde_json::Value,
    project_path: Option<&str>,
) -> Result<String, String> {
    check_ffmpeg()?;

    let paths = input
        .get("paths")
        .and_then(|v| v.as_array())
        .ok_or("Missing 'paths' parameter")?;

    let output_path_str = input
        .get("output_path")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'output_path' parameter")?;

    if paths.len() < 2 {
        return Err("At least 2 video files are required for merging".to_string());
    }

    // Resolve and validate all input paths
    let mut resolved_paths: Vec<PathBuf> = Vec::new();
    for path_val in paths {
        let path_str = path_val.as_str().ok_or("Invalid path in paths array")?;
        let path = resolve_path(path_str, project_path)?;
        if !path.exists() {
            return Err(format!("Video file not found: {}", path.display()));
        }
        resolved_paths.push(path);
    }

    let output_path = resolve_path(output_path_str, project_path)?;

    // Create concat file
    let temp_dir = tempfile::tempdir().map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let concat_file = temp_dir.path().join("concat.txt");

    let concat_content: String = resolved_paths
        .iter()
        .map(|p| format!("file '{}'\n", p.display()))
        .collect();

    std::fs::write(&concat_file, &concat_content)
        .map_err(|e| format!("Failed to write concat file: {}", e))?;

    // Merge videos
    let output = Command::new("ffmpeg")
        .args([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            concat_file.to_str().unwrap(),
            "-c",
            "copy",
            "-y",
            output_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "FFmpeg merge failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(json!({
        "success": true,
        "output_path": output_path.display().to_string(),
        "merged_count": resolved_paths.len(),
        "input_files": resolved_paths.iter().map(|p| p.display().to_string()).collect::<Vec<_>>()
    })
    .to_string())
}

/// Add transition effects
fn execute_add_transition(
    input: &serde_json::Value,
    project_path: Option<&str>,
) -> Result<String, String> {
    check_ffmpeg()?;

    let path_str = input
        .get("path")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'path' parameter")?;

    let transition_type = input
        .get("transition_type")
        .and_then(|v| v.as_str())
        .ok_or("Missing 'transition_type' parameter")?;

    let duration = input
        .get("duration")
        .and_then(|v| v.as_f64())
        .unwrap_or(1.0);

    let path = resolve_path(path_str, project_path)?;

    if !path.exists() {
        return Err(format!("Video file not found: {}", path.display()));
    }

    let output_path = if let Some(out) = input.get("output_path").and_then(|v| v.as_str()) {
        resolve_path(out, project_path)?
    } else {
        generate_output_path(&path, &format!("{}", transition_type))
    };

    // Get video duration
    let duration_output = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to get video duration: {}", e))?;

    let total_duration: f64 = String::from_utf8_lossy(&duration_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0.0);

    // Build filter based on transition type
    let filter = match transition_type {
        "fade_in" => format!("fade=t=in:st=0:d={}", duration),
        "fade_out" => format!(
            "fade=t=out:st={}:d={}",
            total_duration - duration,
            duration
        ),
        "fade_both" => format!(
            "fade=t=in:st=0:d={},fade=t=out:st={}:d={}",
            duration,
            total_duration - duration,
            duration
        ),
        _ => return Err(format!("Unknown transition type: {}", transition_type)),
    };

    let output = Command::new("ffmpeg")
        .args([
            "-i",
            path.to_str().unwrap(),
            "-vf",
            &filter,
            "-c:a",
            "copy",
            "-y",
            output_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "FFmpeg transition failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(json!({
        "success": true,
        "output_path": output_path.display().to_string(),
        "transition_type": transition_type,
        "duration": duration
    })
    .to_string())
}
