import { Component, For, Show } from "solid-js";
import { useVideoEditor } from "../stores/video";
import { open } from "@tauri-apps/plugin-dialog";
import "./VideoBin.css";

const VideoBin: Component = () => {
  const {
    binVideos,
    selectedBinVideo,
    addToBin,
    removeFromBin,
    selectBinVideo,
    addClipToSequence,
    isProcessing,
    inPoint,
    outPoint,
  } = useVideoEditor();

  const handleAddVideos = async () => {
    const selected = await open({
      multiple: true,
      filters: [
        {
          name: "Video",
          extensions: ["mp4", "mov", "avi", "mkv", "webm", "m4v"],
        },
      ],
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      for (const path of paths) {
        await addToBin(path);
      }
    }
  };

  const handleAddToTimeline = (videoId: string) => {
    const inPt = inPoint();
    const outPt = outPoint();

    if (inPt !== null && outPt !== null && selectedBinVideo() === videoId) {
      // Add with in/out points
      addClipToSequence(videoId, Math.min(inPt, outPt), Math.max(inPt, outPt));
    } else {
      // Add whole video
      addClipToSequence(videoId);
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatResolution = (width: number, height: number): string => {
    if (height >= 2160) return "4K";
    if (height >= 1080) return "1080p";
    if (height >= 720) return "720p";
    if (height >= 480) return "480p";
    return `${width}x${height}`;
  };

  return (
    <div class="video-bin">
      <div class="bin-header">
        <h3>Source Videos</h3>
        <button
          class="btn-add"
          onClick={handleAddVideos}
          disabled={isProcessing()}
          title="Add videos"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add
        </button>
      </div>

      <div class="bin-content">
        <Show
          when={binVideos().length > 0}
          fallback={
            <div class="bin-empty">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <p>No videos added</p>
              <p class="hint">Click "Add" to import videos</p>
            </div>
          }
        >
          <div class="bin-list">
            <For each={binVideos()}>
              {(video) => (
                <div
                  class={`bin-item ${selectedBinVideo() === video.id ? "selected" : ""}`}
                  onClick={() => selectBinVideo(video.id)}
                >
                  <div class="bin-item-thumbnail">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
                    </svg>
                  </div>
                  <div class="bin-item-info">
                    <div class="bin-item-name" title={video.name}>
                      {video.name}
                    </div>
                    <div class="bin-item-meta">
                      {formatDuration(video.duration)} | {formatResolution(video.width, video.height)}
                    </div>
                  </div>
                  <div class="bin-item-actions">
                    <button
                      class="btn-icon-small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddToTimeline(video.id);
                      }}
                      title="Add to timeline"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                    </button>
                    <button
                      class="btn-icon-small danger"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromBin(video.id);
                      }}
                      title="Remove from bin"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default VideoBin;
