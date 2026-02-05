// Video editing types

export interface VideoInfo {
  path: string;
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  audio_codec: string | null;
  bitrate: number | null;
  format: string;
}

// Video Bin - source video management
export interface BinVideo extends VideoInfo {
  id: string;
  name: string;
  thumbnail?: string; // base64 thumbnail
  addedAt: number;
}

// Timeline clip - a segment of a source video placed on timeline
export interface TimelineClip {
  id: string;
  sourceId: string; // reference to BinVideo.id
  sourcePath: string;
  name: string;
  // Source timing (from original video)
  sourceIn: number; // start time in source
  sourceOut: number; // end time in source
  // Timeline position
  timelineStart: number; // where this clip starts on timeline
  duration: number; // sourceOut - sourceIn
  // Visual
  color?: string;
}

// Sequence - ordered list of clips
export interface Sequence {
  id: string;
  name: string;
  clips: TimelineClip[];
  totalDuration: number;
}

// Script segment - parsed from script text
export interface ScriptSegment {
  id: string;
  index: number;
  text: string;
  linkedClipId?: string; // link to TimelineClip
  suggestedKeywords?: string[]; // for matching to videos
}

export interface ExtractedFrame {
  index: number;
  timestamp: number;
  path: string;
  base64?: string;
}

export interface SceneInfo {
  start_time: number;
  end_time: number;
  description: string;
  suggested_action: "keep" | "cut" | "trim" | "review";
  confidence: number;
}

export interface RecommendedEdit {
  edit_type: "cut" | "trim" | "transition" | "merge";
  start: number;
  end: number;
  reason: string;
}

export interface AnalysisResult {
  scenes: SceneInfo[];
  recommended_edits: RecommendedEdit[];
}

export interface EditOperation {
  type: "cut" | "trim" | "merge" | "transition";
  input_path: string;
  output_path?: string;
  start_time?: number;
  end_time?: number;
  paths?: string[]; // For merge
  transition_type?: "fade_in" | "fade_out" | "fade_both";
  duration?: number;
}

export interface EditPlan {
  video_path: string;
  operations: EditOperation[];
  status: "pending" | "executing" | "completed" | "failed";
  current_operation: number;
}

export interface TimelineMarker {
  id: string;
  time: number;
  type: "scene" | "in_point" | "out_point" | "edit";
  label?: string;
  color?: string;
}

export interface VideoProgressEvent {
  operation: string;
  progress: number; // 0-100
  current_time?: number;
  total_time?: number;
}

export interface VideoEditorState {
  video: VideoInfo | null;
  frames: ExtractedFrame[];
  analysis: AnalysisResult | null;
  editPlan: EditPlan | null;
  markers: TimelineMarker[];
  inPoint: number | null;
  outPoint: number | null;
  isProcessing: boolean;
  processingStatus: string;
}
