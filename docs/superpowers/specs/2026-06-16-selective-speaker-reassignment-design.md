# Selective Speaker Reassignment Design

**Date:** 2026-06-16
**Status:** Approved

## Overview

Today the only way to change a speaker label in a transcript is to click the speaker name on any one segment and rename — which mutates the global `speakerNames[speakerId]` map and therefore relabels every segment sharing that `speakerId`. There is no way to peel apart segments the diarizer mistakenly grouped together, or to split a single `speakerId` into two distinct identities after the fact.

This feature adds a **Select Mode** to `TranscriptPanel`: the user enables it via a toolbar button, ticks one or more segments, and reassigns the selection to an existing speaker or a newly minted one. The existing rename behaviour is unchanged.

---

## Goals

- Recover from diarizer grouping errors by re-pointing specific segments at a different `speakerId`.
- Support both single-segment and multi-segment selection in one motion.
- Allow minting a new speaker on the fly from inside the reassignment flow.
- Keep the existing per-speaker rename, inline text edit, and segment-delete affordances untouched.
- Survive a reload — reassignment must persist with the rest of the session.

## Non-Goals

- Renaming individual segments while keeping the original `speakerId` (i.e. a free per-segment label that does not correspond to a speaker identity). The user explicitly chose reassignment over free relabeling — see Terminology below.
- Reassignment of segments that have no `speakerId` (no diarization). Out of scope; the Select button is disabled when no segment is diarized.
- Reassignment while a recording is in progress. Diarization runs post-recording (sherpa-onnx is heavy and runs in a worker after Stop), so there are no stable `speakerId`s to reassign during capture.
- Undo for reassignment. Parity with the existing rename, which also has no undo. A combined undo story is a separate, later change.
- Keyboard shortcuts beyond Esc (no Cmd-A, no Shift-range).
- Drag-and-drop reassignment.
- Auto-cleanup of orphaned `speakerId`s (a `speakerId` with zero remaining segments stays in `speakerNames` and continues to appear in the picker). Harmless and reversible.

---

## Terminology

Two operations sound similar and have been historically conflated by users. The spec distinguishes them explicitly:

**Speaker Rename**
The existing behaviour. Clicking a speaker label on any segment opens an inline input and writes `speakerNames[speakerId] = newName`. Every segment sharing that `speakerId` follows. Source of truth: `speakerNames` map.

**Segment Reassignment**
The new behaviour. Selecting one or more segments and re-pointing them at a different `speakerId` — either an existing one or a newly minted one. Source of truth: `segment.speakerId` (mutated in place). The `speakerNames` map is not touched by the reassignment itself; if the target is a new speaker, the user can optionally name it during creation, which then writes a single entry into `speakerNames`.

Reassignment composes cleanly with Rename: peel mis-grouped segments off `speaker_0` onto a new `speaker_3`, then rename `speaker_3` to "Anna" via the existing affordance.

---

## Section 1 — Data Model

No schema changes. The mutation is in place on existing fields:

```ts
// shared/types.ts (existing — unchanged)
export interface TranscriptSegment {
  id: string;
  source: AudioSource;
  speaker: string;
  speakerId?: string;      // stable diarization speaker key
  text: string;
  // ...
}
```

Reassignment writes a new value into `segment.speakerId` for each selected segment. The existing `speakerNames: Record<string, string>` map is untouched by the reassignment itself.

**Minting a new speaker:** when the user picks "+ New speaker" in the picker, a fresh ID is generated using the next-available `speaker_N` convention. The exact rule: look at every `speakerId` in the current `segments` array, parse the trailing integer from any that match `/^speaker_(\d+)$/`, take `max + 1`. If no such IDs exist, start at `speaker_0`. IDs that do not match the pattern (e.g. sherpa-onnx's `"Speaker A"` format) are ignored for the purpose of numbering — the new ID still uses the `speaker_N` form. If a name was typed during creation, also write `speakerNames[newId] = name`.

**Persistence:** the existing `use-session-persistence` hook already serializes `segments` and `speakerNames` on every change. Direct mutation of `segment.speakerId` is picked up automatically. No persistence work needed.

**Markdown export:** the existing export pipeline (`electron/services/markdown-export.ts`, `src/lib/format-export.ts`) resolves the display name via `speakerNames[speakerId] ?? segment.speaker`. Reassignment changes `speakerId`, which the export already reads through. No export changes needed.

---

## Section 2 — UI: Select Mode in TranscriptPanel

### Toolbar

A new "Select" button appears in the transcript panel header (alongside the existing Copy and Dismiss controls in `App.tsx`'s post-recording bar). Disabled state:

- Disabled when **no segment** in the current transcript has a `speakerId`. Tooltip: *"Enable diarization to reassign speakers"*.
- Disabled while `recordingState !== 'idle'`. Tooltip: *"Stop recording to reassign speakers"*.

### Select Mode Lifecycle

Clicking "Select" enters Select Mode. While active:

1. **Per-segment checkboxes** appear left of each segment with a `speakerId`. Segments without `speakerId` show no checkbox and are not selectable.
2. **Every segment shows its full speaker label.** If a consecutive-same-speaker collapse rule is active (planned or merged separately), it is suppressed inside Select Mode — the user needs to see the current assignment to operate on it. On a base where no collapse rule exists, this is a no-op.
3. **An action bar appears** at the top of the panel with: "Select all", a "Reassign to…" button (disabled until ≥1 segment is selected), a selection count, and a Cancel button.
4. **Existing inline-edit affordances are suppressed.** Clicking a speaker label or segment text in Select Mode toggles its checkbox rather than opening the rename or text-edit input.
5. **Esc cancels** Select Mode — equivalent to clicking Cancel.
6. **Recording cannot be started while Select Mode is active.** The record button is disabled with the same tooltip as above, mirrored.

Exiting Select Mode (via Cancel, Esc, or after a successful reassignment) restores the normal panel state: collapse logic resumes, inline edits work as before, checkboxes disappear.

### Reassign Picker (Popover)

Triggered by "Reassign to…" with at least one selection. A shadcn `Popover` containing a `Command`-style list:

```
┌───────────────────────────┐
│ Max (speaker_0)           │
│ Anna (speaker_1)          │
│ speaker_2                 │  ← unnamed
│ ─────────────────────     │
│ + New speaker             │
└───────────────────────────┘
```

- Each row lists every `speakerId` currently present in the transcript, in the order of first appearance. The displayed name uses the same `speakerNames[id] ?? fallback` rule as the panel itself. Unnamed speakers show just their `speakerId`.
- **Clicking an existing speaker:** every selected segment's `speakerId` is set to that value. Popover closes, Select Mode exits.
- **Clicking "+ New speaker":** the row converts into an inline input. Pressing Enter (or blurring with non-empty value) mints a new `speaker_N` ID, sets `speakerNames[newId] = trimmedName` (only if non-empty), reassigns the selected segments to the new ID, closes the popover, and exits Select Mode. Pressing Esc reverts to the list. An empty name is allowed — the new speaker is then unnamed and the user can rename it later via the standard click-to-rename flow.

### Interaction Summary

| Action | Inside Select Mode | Outside Select Mode |
|--------|--------------------|---------------------|
| Click speaker label | Toggle selection | Open rename input (existing) |
| Click segment text | Toggle selection | Open text-edit input (existing) |
| Click "Select" button | n/a (already in mode) | Enter Select Mode |
| Press Esc | Exit Select Mode | n/a |
| Click "Select all" | Selects every segment that has a `speakerId` | n/a (button hidden) |

---

## Section 3 — State & Hook Changes

### `use-transcription.ts`

Add one function, exposed via the returned API:

```ts
function reassignSpeaker(segmentIds: Set<string>, targetSpeakerId: string): void
```

Implementation: `setSegments(prev => prev.map(s => segmentIds.has(s.id) ? { ...s, speakerId: targetSpeakerId } : s))`.

Existing `renameSpeaker`, `updateSegmentText`, and `deleteSegment` are unchanged.

### `TranscriptPanel` props

Three additions:

```ts
onReassignSpeaker?: (segmentIds: Set<string>, targetSpeakerId: string) => void;
onCreateSpeakerAndReassign?: (segmentIds: Set<string>, name: string) => void;
disableSelectMode?: boolean;        // forces Select button disabled
disableSelectModeReason?: string;   // tooltip when disabled
```

`onCreateSpeakerAndReassign` is a thin convenience in the App layer that mints the new ID, optionally writes `speakerNames`, and calls `reassignSpeaker`. Splitting the two callbacks keeps `TranscriptPanel` from needing to compute the next-available speaker ID itself (which requires reading existing IDs across all segments).

### Select Mode state

`TranscriptPanel` owns Select Mode locally:

```ts
const [selectMode, setSelectMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [pickerOpen, setPickerOpen] = useState(false);
const [creatingNew, setCreatingNew] = useState(false);
```

Entering Select Mode resets `selectedIds` to empty. Exiting clears all four.

### App.tsx wiring

`App` passes the new callbacks down. It computes `disableSelectMode = recordingState !== 'idle'` and surfaces the appropriate tooltip.

---

## Section 4 — Edge Cases

| Case | Behaviour |
|------|-----------|
| User selects 0 segments and clicks "Reassign to…" | Button is disabled; no-op. |
| User selects all segments of a speaker and reassigns them | Orphaned source `speakerId` stays in `speakerNames`. Picker still shows it for future use. Harmless. |
| User reassigns to a speaker that doesn't yet exist anywhere (mints new) | New `speaker_N` is created. If the user typed a name, `speakerNames[newId]` is set. Selected segments now point at it. |
| User picks "+ New speaker" then presses Esc with no name typed | Cancels the inline input; the list returns. No new speaker is created. |
| User picks "+ New speaker", types empty string, presses Enter | New `speaker_N` is minted without a name. Segments are reassigned. Picker closes. |
| User reassigns segments to their current `speakerId` | No-op visually. Mutation is a no-op equivalent (`setSegments` maps each segment to itself). |
| Reassignment splits a collapsed group | Collapse logic re-evaluates on next render and exposes the speaker label on segments that are no longer consecutive with a same-speaker neighbour. |
| Diarization is re-run after a manual reassignment | Sherpa-onnx output overwrites `speakerId` on all segments. Manual reassignments are lost. This is consistent with how rename is handled today and is not a regression. |
| Mixed transcript: some segments diarized, others not | Only diarized segments have checkboxes. Non-diarized rows are skipped silently by "Select all". Select button is still enabled. |
| File-imported transcript with diarization | Behaves identically to a live-recorded transcript. |

---

## Section 5 — Visual

The Select button matches the existing post-recording-bar button styling (`Button variant="outline" size="sm"`). Icon: `ListChecks` from lucide. In Select Mode, the button label changes to indicate active state (or a separate Cancel button is shown — final visual decision in implementation).

Checkboxes use shadcn's `Checkbox` component, placed in the existing `shrink-0 pt-0.5` column. The full speaker label sits to the right of the checkbox (unlike normal mode, the label is never collapsed in Select Mode).

The action bar uses a thin border below the panel header, mirroring the post-recording-bar layout: count on the left, action buttons on the right.

The picker is a shadcn `Popover` with a `Command` list. New-speaker creation reuses the same inline-input pattern as the existing speaker rename (defaultValue, onBlur, Enter/Esc keys) — see `SpeakerLabel` in `transcript-panel.tsx`.

---

## Section 6 — Files Touched

**Modified:**
- `src/components/transcript-panel.tsx` — Select Mode UI, checkboxes, action bar, picker popover, conditional rendering for collapsed labels and inline edits.
- `src/hooks/use-transcription.ts` — add `reassignSpeaker`; export it from the returned object.
- `src/App.tsx` — wire `onReassignSpeaker` and `onCreateSpeakerAndReassign`, compute disabled state, pass tooltips. Compute `nextSpeakerId` helper inline or in a small utility.

**Possibly modified (only if tests need supporting fixtures):**
- `src/lib/format-export.test.ts` — already covers `speakerNames[speakerId]` resolution; may add a test for reassigned segments to make the invariant explicit.

**New:**
- `src/components/transcript-panel.test.tsx` (if no existing test file) — unit tests for the pure helpers: `nextSpeakerId`, the reassignment mapper.

No changes to:
- `electron/` (no IPC, no main-process work)
- `shared/types.ts` (no schema changes)
- `shared/store-defaults.ts`
- Persistence layer (`use-session-persistence`)
- Export layer (`markdown-export.ts`, `format-export.ts`)

---

## Out of Scope

- Renaming individual segments while keeping `speakerId` (free per-segment override).
- Reassigning non-diarized segments.
- Reassignment during live recording.
- Undo for reassignment or rename.
- Keyboard shortcuts beyond Esc.
- Drag-and-drop.
- Auto-cleanup of orphaned speaker IDs.
- Manual diarization workflows (creating a multi-speaker labeling from a non-diarized transcript).

## Known Edge Cases (Deferred)

Documented here so reviewers don't need to ask. None of these block v1; each is a follow-up.

- **Re-running diarization wipes manual reassignments.** sherpa-onnx rewrites `speakerId` on every segment when the user clicks "Analyze speakers" a second time (e.g. to retry with a different `numSpeakers`). All manual work is silently lost — no warning, no undo, no merge. Mitigation candidates for a later PR: confirmation dialog before re-run, soft-merge that preserves user-touched segments, snapshot/restore of pre-diarization state.
- **"+ New speaker" with a name that matches an existing speaker creates indistinguishable doppelgangers.** If the user already renamed `Speaker A` to "Dr. Reuss" via the inline rename, then mints a new speaker and types "Dr. Reuss" again, the picker and panel both render two identical-looking entries that point at different `speakerId`s. No collision check today.
- **Mixed-format `speakerId`s in the picker.** sherpa-onnx emits identifiers like `Speaker A`, `Speaker B`; the `+ New speaker` flow mints `speaker_0`, `speaker_1`. After a few iterations the picker shows both styles side-by-side, which is cosmetically jarring and gives the user no signal about which speakers came from where.
- **Picker has no ranking when sherpa over-segments.** If diarization returns ten or more speakers (common when `numSpeakers` is left unset and the audio has brief crosstalk or background voices), the picker is a flat first-appearance-ordered list. Hard to find the speaker who actually owns most of the conversation. A speech-time-descending sort or a "most likely" badge would help.
