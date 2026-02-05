import { Component, For, Show, createSignal } from "solid-js";
import { useVideoEditor } from "../stores/video";
import "./ScriptPanel.css";

const ScriptPanel: Component = () => {
  const {
    scriptText,
    scriptSegments,
    parseScript,
    linkSegmentToClip,
    unlinkSegment,
    setScriptText,
    sequence,
    selectClip,
  } = useVideoEditor();

  const [isEditing, setIsEditing] = createSignal(true);
  const [draggedSegmentId, setDraggedSegmentId] = createSignal<string | null>(null);

  const handleTextChange = (e: Event) => {
    const target = e.target as HTMLTextAreaElement;
    setScriptText(target.value);
  };

  const handleParseScript = () => {
    parseScript(scriptText());
    setIsEditing(false);
  };

  const handleEditScript = () => {
    setIsEditing(true);
  };

  const handleSegmentDragStart = (e: DragEvent, segmentId: string) => {
    setDraggedSegmentId(segmentId);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "link";
      e.dataTransfer.setData("text/plain", segmentId);
    }
  };

  const handleClipDrop = (e: DragEvent, clipId: string) => {
    e.preventDefault();
    const segmentId = draggedSegmentId();
    if (segmentId) {
      linkSegmentToClip(segmentId, clipId);
    }
    setDraggedSegmentId(null);
  };

  const handleClipDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const getLinkedClip = (clipId: string | undefined) => {
    if (!clipId) return null;
    return sequence().clips.find((c) => c.id === clipId);
  };

  const handleSegmentClick = (segmentId: string) => {
    const segment = scriptSegments().find((s) => s.id === segmentId);
    if (segment?.linkedClipId) {
      selectClip(segment.linkedClipId);
    }
  };

  return (
    <div class="script-panel">
      <div class="script-header">
        <h3>Script</h3>
        <div class="script-actions">
          <Show when={!isEditing() && scriptSegments().length > 0}>
            <button class="btn-script" onClick={handleEditScript}>
              Edit
            </button>
          </Show>
          <Show when={isEditing()}>
            <button
              class="btn-script primary"
              onClick={handleParseScript}
              disabled={!scriptText().trim()}
            >
              Parse Script
            </button>
          </Show>
        </div>
      </div>

      <div class="script-content">
        <Show
          when={!isEditing()}
          fallback={
            <div class="script-editor">
              <textarea
                class="script-textarea"
                placeholder="Paste or type your script here...

Example:
The camera pans across the city skyline at sunset.
John walks into frame and looks up at the buildings.
Cut to interior office. Sarah is working at her desk.
John enters the office and greets Sarah."
                value={scriptText()}
                onInput={handleTextChange}
              />
              <div class="script-help">
                <p>Tips:</p>
                <ul>
                  <li>Each sentence will become a segment</li>
                  <li>After parsing, drag segments to clips to link them</li>
                  <li>The AI agent can auto-match segments to videos</li>
                </ul>
              </div>
            </div>
          }
        >
          <div class="script-segments">
            <Show
              when={scriptSegments().length > 0}
              fallback={
                <div class="segments-empty">
                  <p>No script parsed</p>
                </div>
              }
            >
              <For each={scriptSegments()}>
                {(segment) => {
                  const linkedClip = () => getLinkedClip(segment.linkedClipId);
                  return (
                    <div
                      class={`script-segment ${segment.linkedClipId ? "linked" : ""} ${draggedSegmentId() === segment.id ? "dragging" : ""}`}
                      draggable={!segment.linkedClipId}
                      onDragStart={(e) => handleSegmentDragStart(e, segment.id)}
                      onClick={() => handleSegmentClick(segment.id)}
                    >
                      <div class="segment-number">{segment.index + 1}</div>
                      <div class="segment-content">
                        <div class="segment-text">{segment.text}</div>
                        <Show when={segment.suggestedKeywords && segment.suggestedKeywords.length > 0}>
                          <div class="segment-keywords">
                            <For each={segment.suggestedKeywords!.slice(0, 5)}>
                              {(keyword) => (
                                <span class="keyword-tag">{keyword}</span>
                              )}
                            </For>
                          </div>
                        </Show>
                        <Show when={linkedClip()}>
                          <div class="segment-link">
                            <span
                              class="link-badge"
                              style={{ "background-color": linkedClip()!.color }}
                            >
                              {linkedClip()!.name}
                            </span>
                            <button
                              class="unlink-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                unlinkSegment(segment.id);
                              }}
                              title="Unlink"
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </Show>
                      </div>
                      <Show when={!segment.linkedClipId}>
                        <div class="segment-drag-hint">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M8 6h.01M8 12h.01M8 18h.01M16 6h.01M16 12h.01M16 18h.01" />
                          </svg>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>

          <Show when={sequence().clips.length > 0}>
            <div class="link-targets">
              <div class="link-targets-header">Drop segments on clips:</div>
              <div class="link-targets-list">
                <For each={sequence().clips}>
                  {(clip) => (
                    <div
                      class="link-target-clip"
                      style={{ "border-color": clip.color }}
                      onDragOver={handleClipDragOver}
                      onDrop={(e) => handleClipDrop(e, clip.id)}
                    >
                      <span
                        class="clip-color-bar"
                        style={{ "background-color": clip.color }}
                      />
                      <span class="clip-name">{clip.name}</span>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default ScriptPanel;
