import {
  Component,
  Show,
  For,
  createSignal,
  createEffect,
  onCleanup,
} from "solid-js";
import { useVideoEditor } from "../stores/video";
import type { TimelineMarker, EditPlan } from "../types/video";
import { convertFileSrc } from "@tauri-apps/api/core";
import VideoBin from "./VideoBin";
import SequenceTimeline from "./SequenceTimeline";
import ScriptPanel from "./ScriptPanel";
import "./VideoPreviewPanel.css";

interface VideoPreviewPanelProps {
  onEditPlanChange?: (plan: EditPlan | null) => void;
}

const VideoPreviewPanel: Component<VideoPreviewPanelProps> = (props) => {
  const {
    video,
    markers,
    inPoint,
    outPoint,
    isProcessing,
    processingStatus,
    editPlan,
    currentTime,
    extractFrames,
    setInPointTime,
    setOutPointTime,
    clearInOutPoints,
    setCurrentTime,
    binVideos,
    sequence,
    clearAll,
  } = useVideoEditor();

  let videoRef: HTMLVideoElement | undefined;
  const [isPlaying, setIsPlaying] = createSignal(false);
  const [duration, setDuration] = createSignal(0);
  const [playbackRate, setPlaybackRate] = createSignal(1);
  const [volume, setVolume] = createSignal(1);
  const [activeTab, setActiveTab] = createSignal<"preview" | "script">("preview");

  // Update edit plan callback
  createEffect(() => {
    if (props.onEditPlanChange) {
      props.onEditPlanChange(editPlan());
    }
  });

  // Sync video time with store
  createEffect(() => {
    if (videoRef) {
      const handleTimeUpdate = () => {
        setCurrentTime(videoRef!.currentTime);
      };
      videoRef.addEventListener("timeupdate", handleTimeUpdate);
      onCleanup(() => {
        videoRef?.removeEventListener("timeupdate", handleTimeUpdate);
      });
    }
  });

  // Update duration when video changes
  createEffect(() => {
    const currentVideo = video();
    if (currentVideo) {
      setDuration(currentVideo.duration);
    }
  });

  const handleLoadedMetadata = () => {
    if (videoRef) {
      setDuration(videoRef.duration);
    }
  };

  const handlePlayPause = () => {
    if (videoRef) {
      if (isPlaying()) {
        videoRef.pause();
      } else {
        videoRef.play();
      }
      setIsPlaying(!isPlaying());
    }
  };

  const handleSeek = (time: number) => {
    if (videoRef) {
      videoRef.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimelineClick = (e: MouseEvent) => {
    const timeline = e.currentTarget as HTMLElement;
    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const time = percent * duration();
    handleSeek(time);
  };

  const handleSetInPoint = () => {
    setInPointTime(currentTime());
  };

  const handleSetOutPoint = () => {
    setOutPointTime(currentTime());
  };

  const handlePlaybackRateChange = (rate: number) => {
    if (videoRef) {
      videoRef.playbackRate = rate;
      setPlaybackRate(rate);
    }
  };

  const handleVolumeChange = (vol: number) => {
    if (videoRef) {
      videoRef.volume = vol;
      setVolume(vol);
    }
  };

  const handleExtractFrames = async () => {
    try {
      await extractFrames(5, 10, false);
    } catch (error) {
      console.error("Failed to extract frames:", error);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const getMarkerPosition = (marker: TimelineMarker): number => {
    return (marker.time / duration()) * 100;
  };

  const getSelectionStyle = () => {
    const inPt = inPoint();
    const outPt = outPoint();
    if (inPt === null || outPt === null) return {};

    const startPercent = (Math.min(inPt, outPt) / duration()) * 100;
    const endPercent = (Math.max(inPt, outPt) / duration()) * 100;
    return {
      left: `${startPercent}%`,
      width: `${endPercent - startPercent}%`,
    };
  };

  return (
    <div class="video-editor-layout">
      {/* Left Panel - Video Bin */}
      <div class="editor-left-panel">
        <VideoBin />
      </div>

      {/* Center Panel - Preview + Timeline */}
      <div class="editor-center-panel">
        <div class="video-preview-panel">
          <Show
            when={video()}
            fallback={
              <div class="video-empty-state">
                <div class="empty-icon">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3>Select a Video</h3>
                <p>Add videos to the bin, then select one to preview</p>
              </div>
            }
          >
            <div class="video-header">
              <div class="video-title">{video()!.path.split("/").pop()}</div>
              <div class="video-meta">
                {video()!.width}x{video()!.height} | {video()!.fps.toFixed(2)} fps |{" "}
                {video()!.codec}
              </div>
            </div>

            <div class="video-container">
              <video
                ref={videoRef}
                src={convertFileSrc(video()!.path)}
                onLoadedMetadata={handleLoadedMetadata}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
              />

              <Show when={isProcessing()}>
                <div class="video-processing-overlay">
                  <div class="processing-spinner" />
                  <span>{processingStatus()}</span>
                </div>
              </Show>
            </div>

            <div class="video-controls">
              <button class="btn-control" onClick={handlePlayPause}>
                <Show
                  when={isPlaying()}
                  fallback={
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  }
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
                  </svg>
                </Show>
              </button>

              <div class="time-display">
                <span class="current-time">{formatTime(currentTime())}</span>
                <span class="time-separator">/</span>
                <span class="total-time">{formatTime(duration())}</span>
              </div>

              <div class="playback-rate">
                <select
                  value={playbackRate()}
                  onChange={(e) =>
                    handlePlaybackRateChange(parseFloat(e.currentTarget.value))
                  }
                >
                  <option value="0.25">0.25x</option>
                  <option value="0.5">0.5x</option>
                  <option value="1">1x</option>
                  <option value="1.5">1.5x</option>
                  <option value="2">2x</option>
                </select>
              </div>

              <div class="volume-control">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                </svg>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume()}
                  onInput={(e) =>
                    handleVolumeChange(parseFloat(e.currentTarget.value))
                  }
                />
              </div>
            </div>

            <div class="timeline-container">
              <div class="timeline" onClick={handleTimelineClick}>
                <div
                  class="timeline-progress"
                  style={{ width: `${(currentTime() / duration()) * 100}%` }}
                />
                <div
                  class="timeline-playhead"
                  style={{ left: `${(currentTime() / duration()) * 100}%` }}
                />

                <Show when={inPoint() !== null && outPoint() !== null}>
                  <div class="timeline-selection" style={getSelectionStyle()} />
                </Show>

                <For each={markers()}>
                  {(marker) => (
                    <div
                      class={`timeline-marker marker-${marker.type}`}
                      style={{
                        left: `${getMarkerPosition(marker)}%`,
                        "background-color": marker.color,
                      }}
                      title={`${marker.label || marker.type} at ${formatTime(
                        marker.time
                      )}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSeek(marker.time);
                      }}
                    />
                  )}
                </For>
              </div>
            </div>

            <div class="edit-controls">
              <div class="edit-group">
                <button
                  class="btn-edit"
                  onClick={handleSetInPoint}
                  title="Set In Point (I)"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M5 4v16M9 4l10 8-10 8V4z" />
                  </svg>
                  In
                </button>
                <button
                  class="btn-edit"
                  onClick={handleSetOutPoint}
                  title="Set Out Point (O)"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M19 4v16M15 4L5 12l10 8V4z" />
                  </svg>
                  Out
                </button>
                <button
                  class="btn-edit"
                  onClick={clearInOutPoints}
                  title="Clear In/Out"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  Clear
                </button>
              </div>

              <Show when={inPoint() !== null && outPoint() !== null}>
                <div class="selection-info">
                  Selection: {formatTime(Math.min(inPoint()!, outPoint()!))} -{" "}
                  {formatTime(Math.max(inPoint()!, outPoint()!))} (
                  {formatTime(Math.abs(outPoint()! - inPoint()!))})
                </div>
              </Show>

              <div class="edit-group">
                <button
                  class="btn-edit"
                  onClick={handleExtractFrames}
                  disabled={isProcessing()}
                  title="Extract frames for analysis"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="3" y1="9" x2="21" y2="9" />
                    <line x1="9" y1="21" x2="9" y2="9" />
                  </svg>
                  Extract Frames
                </button>
              </div>
            </div>
          </Show>
        </div>

        {/* Sequence Timeline */}
        <SequenceTimeline />
      </div>

      {/* Right Panel - Script */}
      <div class="editor-right-panel">
        <ScriptPanel />
      </div>
    </div>
  );
};

export default VideoPreviewPanel;
