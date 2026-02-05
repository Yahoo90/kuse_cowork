import { Component, For, Show, createSignal } from "solid-js";
import { useVideoEditor } from "../stores/video";
import "./SequenceTimeline.css";

const SequenceTimeline: Component = () => {
  const {
    sequence,
    selectedClipId,
    playheadPosition,
    selectClip,
    removeClipFromSequence,
    moveClip,
    setPlayheadPosition,
    clearSequence,
    binVideos,
  } = useVideoEditor();

  const [draggedClipId, setDraggedClipId] = createSignal<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = createSignal<number | null>(null);

  const PIXELS_PER_SECOND = 50;
  const TRACK_HEIGHT = 48;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleTimelineClick = (e: MouseEvent) => {
    const timeline = e.currentTarget as HTMLElement;
    const rect = timeline.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = x / PIXELS_PER_SECOND;
    setPlayheadPosition(Math.max(0, Math.min(time, sequence().totalDuration)));
  };

  const handleClipClick = (e: MouseEvent, clipId: string) => {
    e.stopPropagation();
    selectClip(clipId);
  };

  const handleDragStart = (e: DragEvent, clipId: string) => {
    setDraggedClipId(clipId);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDragOver = (e: DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: DragEvent, targetIndex: number) => {
    e.preventDefault();
    const clipId = draggedClipId();
    if (clipId) {
      moveClip(clipId, targetIndex);
    }
    setDraggedClipId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedClipId(null);
    setDragOverIndex(null);
  };

  const getClipSource = (sourceId: string) => {
    return binVideos().find((v) => v.id === sourceId);
  };

  const timelineWidth = () => Math.max(sequence().totalDuration * PIXELS_PER_SECOND, 500);

  // Generate time markers
  const timeMarkers = () => {
    const markers = [];
    const duration = Math.max(sequence().totalDuration, 10);
    const interval = duration > 60 ? 10 : duration > 30 ? 5 : 1;
    for (let t = 0; t <= duration; t += interval) {
      markers.push(t);
    }
    return markers;
  };

  return (
    <div class="sequence-timeline">
      <div class="timeline-header">
        <div class="timeline-title">
          <h3>{sequence().name}</h3>
          <span class="timeline-duration">{formatTime(sequence().totalDuration)}</span>
        </div>
        <div class="timeline-actions">
          <Show when={sequence().clips.length > 0}>
            <button class="btn-clear" onClick={clearSequence} title="Clear timeline">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              </svg>
              Clear
            </button>
          </Show>
        </div>
      </div>

      <div class="timeline-scroll-container">
        <div class="timeline-ruler" style={{ width: `${timelineWidth()}px` }}>
          <For each={timeMarkers()}>
            {(time) => (
              <div
                class="ruler-mark"
                style={{ left: `${time * PIXELS_PER_SECOND}px` }}
              >
                <span class="ruler-label">{formatTime(time)}</span>
              </div>
            )}
          </For>
        </div>

        <div
          class="timeline-track-container"
          style={{ width: `${timelineWidth()}px` }}
          onClick={handleTimelineClick}
        >
          <Show
            when={sequence().clips.length > 0}
            fallback={
              <div class="timeline-empty">
                <p>No clips on timeline</p>
                <p class="hint">Add videos from the bin to start editing</p>
              </div>
            }
          >
            <div class="timeline-track" style={{ height: `${TRACK_HEIGHT}px` }}>
              <For each={sequence().clips}>
                {(clip, index) => (
                  <>
                    <Show when={dragOverIndex() === index()}>
                      <div
                        class="drop-indicator"
                        style={{ left: `${clip.timelineStart * PIXELS_PER_SECOND}px` }}
                      />
                    </Show>
                    <div
                      class={`timeline-clip ${selectedClipId() === clip.id ? "selected" : ""} ${draggedClipId() === clip.id ? "dragging" : ""}`}
                      style={{
                        left: `${clip.timelineStart * PIXELS_PER_SECOND}px`,
                        width: `${clip.duration * PIXELS_PER_SECOND}px`,
                        "background-color": clip.color,
                      }}
                      onClick={(e) => handleClipClick(e, clip.id)}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, clip.id)}
                      onDragOver={(e) => handleDragOver(e, index())}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, index())}
                      onDragEnd={handleDragEnd}
                    >
                      <div class="clip-content">
                        <span class="clip-name">{clip.name}</span>
                        <span class="clip-duration">{formatTime(clip.duration)}</span>
                      </div>
                      <button
                        class="clip-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeClipFromSequence(clip.id);
                        }}
                        title="Remove clip"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </For>
              <Show when={dragOverIndex() === sequence().clips.length}>
                <div
                  class="drop-indicator"
                  style={{ left: `${sequence().totalDuration * PIXELS_PER_SECOND}px` }}
                />
              </Show>
            </div>

            {/* Playhead */}
            <div
              class="timeline-playhead"
              style={{ left: `${playheadPosition() * PIXELS_PER_SECOND}px` }}
            >
              <div class="playhead-head" />
              <div class="playhead-line" style={{ height: `${TRACK_HEIGHT}px` }} />
            </div>
          </Show>
        </div>
      </div>

      <Show when={selectedClipId()}>
        {(clipId) => {
          const clip = () => sequence().clips.find((c) => c.id === clipId());
          return (
            <Show when={clip()}>
              <div class="clip-info-bar">
                <span class="clip-info-name">{clip()!.name}</span>
                <span class="clip-info-source">
                  Source: {formatTime(clip()!.sourceIn)} - {formatTime(clip()!.sourceOut)}
                </span>
                <span class="clip-info-timeline">
                  Timeline: {formatTime(clip()!.timelineStart)}
                </span>
              </div>
            </Show>
          );
        }}
      </Show>
    </div>
  );
};

export default SequenceTimeline;
