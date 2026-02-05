import { createSignal } from "solid-js";
import type {
  VideoInfo,
  ExtractedFrame,
  AnalysisResult,
  EditPlan,
  TimelineMarker,
  EditOperation,
  BinVideo,
  TimelineClip,
  Sequence,
  ScriptSegment,
} from "../types/video";
import {
  getVideoInfo,
  extractVideoFrames,
  executeVideoEdit,
} from "../lib/tauri-api";

// Global video editor state
const [video, setVideo] = createSignal<VideoInfo | null>(null);
const [frames, setFrames] = createSignal<ExtractedFrame[]>([]);
const [analysis, setAnalysis] = createSignal<AnalysisResult | null>(null);
const [editPlan, setEditPlan] = createSignal<EditPlan | null>(null);
const [markers, setMarkers] = createSignal<TimelineMarker[]>([]);
const [inPoint, setInPoint] = createSignal<number | null>(null);
const [outPoint, setOutPoint] = createSignal<number | null>(null);
const [isProcessing, setIsProcessing] = createSignal(false);
const [processingStatus, setProcessingStatus] = createSignal("");
const [currentTime, setCurrentTime] = createSignal(0);

// Video Bin state
const [binVideos, setBinVideos] = createSignal<BinVideo[]>([]);
const [selectedBinVideo, setSelectedBinVideo] = createSignal<string | null>(null);

// Sequence/Timeline state
const [sequence, setSequence] = createSignal<Sequence>({
  id: "main",
  name: "Main Sequence",
  clips: [],
  totalDuration: 0,
});
const [selectedClipId, setSelectedClipId] = createSignal<string | null>(null);
const [playheadPosition, setPlayheadPosition] = createSignal(0);

// Script state
const [scriptText, setScriptText] = createSignal("");
const [scriptSegments, setScriptSegments] = createSignal<ScriptSegment[]>([]);

export function useVideoEditor() {
  const openVideo = async (path: string): Promise<VideoInfo | null> => {
    setIsProcessing(true);
    setProcessingStatus("Loading video...");

    try {
      const info = await getVideoInfo(path);
      setVideo(info);
      setFrames([]);
      setAnalysis(null);
      setEditPlan(null);
      setMarkers([]);
      setInPoint(null);
      setOutPoint(null);
      return info;
    } catch (error) {
      console.error("Failed to open video:", error);
      return null;
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const extractFrames = async (
    intervalSeconds: number = 5,
    maxFrames: number = 10,
    includeBase64: boolean = false
  ): Promise<ExtractedFrame[]> => {
    const currentVideo = video();
    if (!currentVideo) {
      throw new Error("No video loaded");
    }

    setIsProcessing(true);
    setProcessingStatus("Extracting frames...");

    try {
      const extractedFrames = await extractVideoFrames(
        currentVideo.path,
        intervalSeconds,
        maxFrames,
        includeBase64
      );
      setFrames(extractedFrames);

      // Add frame markers to timeline
      const frameMarkers: TimelineMarker[] = extractedFrames.map((frame, i) => ({
        id: `frame-${i}`,
        time: frame.timestamp,
        type: "scene" as const,
        label: `Frame ${i + 1}`,
        color: "#3b82f6",
      }));
      setMarkers((prev) => [...prev.filter((m) => m.type !== "scene"), ...frameMarkers]);

      return extractedFrames;
    } catch (error) {
      console.error("Failed to extract frames:", error);
      throw error;
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const setAnalysisResult = (result: AnalysisResult) => {
    setAnalysis(result);

    // Add scene markers from analysis
    const sceneMarkers: TimelineMarker[] = result.scenes.map((scene, i) => ({
      id: `scene-${i}`,
      time: scene.start_time,
      type: "scene" as const,
      label: scene.description.slice(0, 30),
      color: scene.suggested_action === "cut" ? "#ef4444" : "#22c55e",
    }));

    setMarkers((prev) => [
      ...prev.filter((m) => !m.id.startsWith("scene-")),
      ...sceneMarkers,
    ]);
  };

  const setInPointTime = (time: number) => {
    setInPoint(time);
    setMarkers((prev) => [
      ...prev.filter((m) => m.type !== "in_point"),
      {
        id: "in-point",
        time,
        type: "in_point" as const,
        label: "In",
        color: "#22c55e",
      },
    ]);
  };

  const setOutPointTime = (time: number) => {
    setOutPoint(time);
    setMarkers((prev) => [
      ...prev.filter((m) => m.type !== "out_point"),
      {
        id: "out-point",
        time,
        type: "out_point" as const,
        label: "Out",
        color: "#ef4444",
      },
    ]);
  };

  const clearInOutPoints = () => {
    setInPoint(null);
    setOutPoint(null);
    setMarkers((prev) =>
      prev.filter((m) => m.type !== "in_point" && m.type !== "out_point")
    );
  };

  const createEditPlan = (operations: EditOperation[]) => {
    const currentVideo = video();
    if (!currentVideo) return;

    setEditPlan({
      video_path: currentVideo.path,
      operations,
      status: "pending",
      current_operation: 0,
    });
  };

  const executeEdit = async (edit: EditOperation): Promise<string> => {
    setIsProcessing(true);
    setProcessingStatus(`Executing ${edit.type}...`);

    try {
      const result = await executeVideoEdit(edit);
      return result;
    } catch (error) {
      console.error("Failed to execute edit:", error);
      throw error;
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const executePlan = async (): Promise<void> => {
    const plan = editPlan();
    if (!plan) return;

    setEditPlan({ ...plan, status: "executing" });

    for (let i = 0; i < plan.operations.length; i++) {
      setEditPlan((prev) =>
        prev ? { ...prev, current_operation: i } : null
      );

      try {
        await executeEdit(plan.operations[i]);
      } catch (error) {
        setEditPlan((prev) =>
          prev ? { ...prev, status: "failed" } : null
        );
        throw error;
      }
    }

    setEditPlan((prev) =>
      prev ? { ...prev, status: "completed" } : null
    );
  };

  const closeVideo = () => {
    setVideo(null);
    setFrames([]);
    setAnalysis(null);
    setEditPlan(null);
    setMarkers([]);
    setInPoint(null);
    setOutPoint(null);
    setIsProcessing(false);
    setProcessingStatus("");
    setCurrentTime(0);
  };

  // ==================== Video Bin Functions ====================

  const addToBin = async (path: string): Promise<BinVideo | null> => {
    setIsProcessing(true);
    setProcessingStatus("Adding video to bin...");

    try {
      const info = await getVideoInfo(path);
      const id = `bin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const name = path.split("/").pop() || "Untitled";

      const binVideo: BinVideo = {
        ...info,
        id,
        name,
        addedAt: Date.now(),
      };

      setBinVideos((prev) => [...prev, binVideo]);
      return binVideo;
    } catch (error) {
      console.error("Failed to add video to bin:", error);
      return null;
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const removeFromBin = (id: string) => {
    setBinVideos((prev) => prev.filter((v) => v.id !== id));
    // Also remove any clips from this source
    setSequence((prev) => ({
      ...prev,
      clips: prev.clips.filter((c) => c.sourceId !== id),
      totalDuration: calculateTotalDuration(prev.clips.filter((c) => c.sourceId !== id)),
    }));
  };

  const selectBinVideo = (id: string | null) => {
    setSelectedBinVideo(id);
    if (id) {
      const binVideo = binVideos().find((v) => v.id === id);
      if (binVideo) {
        setVideo(binVideo);
      }
    }
  };

  // ==================== Sequence/Timeline Functions ====================

  const calculateTotalDuration = (clips: TimelineClip[]): number => {
    if (clips.length === 0) return 0;
    const lastClip = clips[clips.length - 1];
    return lastClip.timelineStart + lastClip.duration;
  };

  const recalculateTimelinePositions = (clips: TimelineClip[]): TimelineClip[] => {
    let currentPosition = 0;
    return clips.map((clip) => {
      const updatedClip = { ...clip, timelineStart: currentPosition };
      currentPosition += clip.duration;
      return updatedClip;
    });
  };

  const addClipToSequence = (sourceId: string, sourceIn?: number, sourceOut?: number) => {
    const source = binVideos().find((v) => v.id === sourceId);
    if (!source) return;

    const clipIn = sourceIn ?? 0;
    const clipOut = sourceOut ?? source.duration;
    const duration = clipOut - clipIn;

    const newClip: TimelineClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceId,
      sourcePath: source.path,
      name: source.name,
      sourceIn: clipIn,
      sourceOut: clipOut,
      timelineStart: sequence().totalDuration,
      duration,
      color: getClipColor(sequence().clips.length),
    };

    setSequence((prev) => ({
      ...prev,
      clips: [...prev.clips, newClip],
      totalDuration: prev.totalDuration + duration,
    }));
  };

  const removeClipFromSequence = (clipId: string) => {
    setSequence((prev) => {
      const newClips = prev.clips.filter((c) => c.id !== clipId);
      const recalculated = recalculateTimelinePositions(newClips);
      return {
        ...prev,
        clips: recalculated,
        totalDuration: calculateTotalDuration(recalculated),
      };
    });
  };

  const moveClip = (clipId: string, newIndex: number) => {
    setSequence((prev) => {
      const clips = [...prev.clips];
      const currentIndex = clips.findIndex((c) => c.id === clipId);
      if (currentIndex === -1 || currentIndex === newIndex) return prev;

      const [clip] = clips.splice(currentIndex, 1);
      clips.splice(newIndex, 0, clip);

      const recalculated = recalculateTimelinePositions(clips);
      return {
        ...prev,
        clips: recalculated,
        totalDuration: calculateTotalDuration(recalculated),
      };
    });
  };

  const trimClip = (clipId: string, newSourceIn: number, newSourceOut: number) => {
    setSequence((prev) => {
      const clips = prev.clips.map((c) => {
        if (c.id !== clipId) return c;
        return {
          ...c,
          sourceIn: newSourceIn,
          sourceOut: newSourceOut,
          duration: newSourceOut - newSourceIn,
        };
      });
      const recalculated = recalculateTimelinePositions(clips);
      return {
        ...prev,
        clips: recalculated,
        totalDuration: calculateTotalDuration(recalculated),
      };
    });
  };

  const selectClip = (clipId: string | null) => {
    setSelectedClipId(clipId);
  };

  const getClipColor = (index: number): string => {
    const colors = [
      "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
      "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
    ];
    return colors[index % colors.length];
  };

  // ==================== Script Functions ====================

  const parseScript = (text: string) => {
    setScriptText(text);

    // Split by sentences or line breaks
    const lines = text
      .split(/[.!?]\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const segments: ScriptSegment[] = lines.map((line, index) => ({
      id: `seg-${index}`,
      index,
      text: line,
      suggestedKeywords: extractKeywords(line),
    }));

    setScriptSegments(segments);
  };

  const extractKeywords = (text: string): string[] => {
    // Simple keyword extraction - remove common words
    const stopWords = new Set([
      "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "must", "shall", "can", "to", "of", "in",
      "for", "on", "with", "at", "by", "from", "as", "into", "through",
      "and", "but", "or", "nor", "so", "yet", "both", "either", "neither",
      "not", "only", "own", "same", "than", "too", "very", "just", "also",
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.has(word));
  };

  const linkSegmentToClip = (segmentId: string, clipId: string) => {
    setScriptSegments((prev) =>
      prev.map((seg) =>
        seg.id === segmentId ? { ...seg, linkedClipId: clipId } : seg
      )
    );
  };

  const unlinkSegment = (segmentId: string) => {
    setScriptSegments((prev) =>
      prev.map((seg) =>
        seg.id === segmentId ? { ...seg, linkedClipId: undefined } : seg
      )
    );
  };

  const clearSequence = () => {
    setSequence({
      id: "main",
      name: "Main Sequence",
      clips: [],
      totalDuration: 0,
    });
    setSelectedClipId(null);
    setPlayheadPosition(0);
  };

  const clearAll = () => {
    closeVideo();
    setBinVideos([]);
    setSelectedBinVideo(null);
    clearSequence();
    setScriptText("");
    setScriptSegments([]);
  };

  return {
    // State
    video,
    frames,
    analysis,
    editPlan,
    markers,
    inPoint,
    outPoint,
    isProcessing,
    processingStatus,
    currentTime,

    // Video Bin state
    binVideos,
    selectedBinVideo,

    // Sequence state
    sequence,
    selectedClipId,
    playheadPosition,

    // Script state
    scriptText,
    scriptSegments,

    // Single video actions
    openVideo,
    extractFrames,
    setAnalysisResult,
    setInPointTime,
    setOutPointTime,
    clearInOutPoints,
    createEditPlan,
    executeEdit,
    executePlan,
    closeVideo,
    setCurrentTime,
    setMarkers,

    // Video Bin actions
    addToBin,
    removeFromBin,
    selectBinVideo,

    // Sequence actions
    addClipToSequence,
    removeClipFromSequence,
    moveClip,
    trimClip,
    selectClip,
    setPlayheadPosition,
    clearSequence,

    // Script actions
    parseScript,
    linkSegmentToClip,
    unlinkSegment,
    setScriptText,

    // Global actions
    clearAll,
  };
}
