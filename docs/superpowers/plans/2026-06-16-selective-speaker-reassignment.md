# Selective Speaker Reassignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to select one or more transcript segments and reassign them to a different `speakerId` (existing or freshly minted), so diarizer grouping errors can be corrected without affecting unselected segments.

**Architecture:** No data-model change. Pure logic for ID minting and segment mapping lives in a new `src/lib/speaker-utils.ts`. A new `reassignSpeaker(segmentIds, targetSpeakerId)` function in `use-transcription.ts` writes through `setSegments`. `TranscriptPanel` gains a Select Mode (toggled from the App's post-recording bar) with per-segment checkboxes, a Reassign popover listing existing speakers plus "+ New speaker", and an inline-create flow. Collapse logic is suppressed while Select Mode is active.

**Tech Stack:** TypeScript, React, shadcn/ui (Popover, Command, Checkbox), Vitest

---

## File Map

**New files:**
- `src/lib/speaker-utils.ts` — `nextSpeakerId(segments)` and `reassignSegments(segments, ids, target)` pure helpers
- `src/lib/speaker-utils.test.ts` — unit tests for both

**Modified files:**
- `src/hooks/use-transcription.ts` — add and export `reassignSpeaker`; helper for create-and-reassign
- `src/components/transcript-panel.tsx` — Select Mode, checkboxes, action bar, reassign popover; suppress collapse and inline edits while in mode
- `src/App.tsx` — wire `onReassignSpeaker` and `onCreateSpeakerAndReassign`, compute disabled state and tooltip
- `src/components/ui/checkbox.tsx` — add via shadcn CLI if not already present (only if missing)

---

## Task 1: Pure Helpers (TDD)

**Files:**
- Create: `src/lib/speaker-utils.ts`
- Create: `src/lib/speaker-utils.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/speaker-utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { nextSpeakerId, reassignSegments } from './speaker-utils';
import type { TranscriptSegment } from '@/types/transcription';

function seg(id: string, speakerId: string | undefined): TranscriptSegment {
  return {
    id,
    source: 'mic',
    speaker: speakerId ?? '',
    speakerId,
    text: '',
    timestamp: 0,
    speechStartMs: 0,
    startTime: 0,
    endTime: 0,
  };
}

describe('nextSpeakerId', () => {
  it('returns speaker_0 when no segments have a speakerId', () => {
    expect(nextSpeakerId([])).toBe('speaker_0');
    expect(nextSpeakerId([seg('a', undefined)])).toBe('speaker_0');
  });

  it('returns max+1 of trailing integers in speaker_N IDs', () => {
    const segs = [seg('a', 'speaker_0'), seg('b', 'speaker_2'), seg('c', 'speaker_1')];
    expect(nextSpeakerId(segs)).toBe('speaker_3');
  });

  it('ignores IDs that do not match the speaker_N pattern', () => {
    const segs = [seg('a', 'Speaker A'), seg('b', 'speaker_5'), seg('c', 'sherpa-onnx-7')];
    expect(nextSpeakerId(segs)).toBe('speaker_6');
  });

  it('returns speaker_0 when only non-matching IDs exist', () => {
    const segs = [seg('a', 'Speaker A'), seg('b', 'Speaker B')];
    expect(nextSpeakerId(segs)).toBe('speaker_0');
  });
});

describe('reassignSegments', () => {
  it('updates speakerId only for segments whose id is in the set', () => {
    const segs = [
      seg('a', 'speaker_0'),
      seg('b', 'speaker_0'),
      seg('c', 'speaker_0'),
    ];
    const result = reassignSegments(segs, new Set(['a', 'c']), 'speaker_2');
    expect(result[0].speakerId).toBe('speaker_2');
    expect(result[1].speakerId).toBe('speaker_0');
    expect(result[2].speakerId).toBe('speaker_2');
  });

  it('returns a new array (does not mutate input)', () => {
    const segs = [seg('a', 'speaker_0')];
    const result = reassignSegments(segs, new Set(['a']), 'speaker_1');
    expect(result).not.toBe(segs);
    expect(segs[0].speakerId).toBe('speaker_0');
  });

  it('is a no-op visually when targetSpeakerId matches current', () => {
    const segs = [seg('a', 'speaker_0')];
    const result = reassignSegments(segs, new Set(['a']), 'speaker_0');
    expect(result[0].speakerId).toBe('speaker_0');
  });

  it('ignores ids that are not present in the segments list', () => {
    const segs = [seg('a', 'speaker_0')];
    const result = reassignSegments(segs, new Set(['nonexistent']), 'speaker_2');
    expect(result[0].speakerId).toBe('speaker_0');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm exec vitest run src/lib/speaker-utils.test.ts 2>&1 | tail -15
```

Expected: FAIL — "Cannot find module './speaker-utils'"

- [ ] **Step 3: Implement `src/lib/speaker-utils.ts`**

```typescript
import type { TranscriptSegment } from '@/types/transcription';

/**
 * Pick the next available speaker_N id by looking at every segment's speakerId,
 * extracting the trailing integer from any that match `speaker_<digits>`, and
 * returning `speaker_<max+1>`. IDs in other formats (e.g. sherpa-onnx's
 * "Speaker A") are ignored for numbering — the minted ID always uses
 * `speaker_N`. When no matching IDs exist, returns `speaker_0`.
 */
export function nextSpeakerId(segments: TranscriptSegment[]): string {
  let max = -1;
  for (const s of segments) {
    if (!s.speakerId) continue;
    const match = /^speaker_(\d+)$/.exec(s.speakerId);
    if (!match) continue;
    const n = Number.parseInt(match[1], 10);
    if (n > max) max = n;
  }
  return `speaker_${max + 1}`;
}

/**
 * Return a new segments array with `speakerId` overwritten on every segment
 * whose `id` is in `selectedIds`. Other segments are returned by reference.
 * The input array is not mutated.
 */
export function reassignSegments(
  segments: TranscriptSegment[],
  selectedIds: Set<string>,
  targetSpeakerId: string,
): TranscriptSegment[] {
  return segments.map((s) =>
    selectedIds.has(s.id) ? { ...s, speakerId: targetSpeakerId } : s,
  );
}
```

- [ ] **Step 4: Run tests — expect passing**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm exec vitest run src/lib/speaker-utils.test.ts 2>&1 | tail -10
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto
git add src/lib/speaker-utils.ts src/lib/speaker-utils.test.ts
git commit -m "feat: add nextSpeakerId + reassignSegments helpers for speaker reassignment"
```

---

## Task 2: Hook API in `use-transcription.ts`

**Files:**
- Modify: `src/hooks/use-transcription.ts`

- [ ] **Step 1: Add `reassignSpeaker` and `createSpeakerAndReassign`**

Inside the hook, after the existing `renameSpeaker` callback (around line 207), add:

```typescript
const reassignSpeaker = useCallback((segmentIds: Set<string>, targetSpeakerId: string) => {
  setSegments((prev) => reassignSegments(prev, segmentIds, targetSpeakerId));
}, []);

const createSpeakerAndReassign = useCallback((segmentIds: Set<string>, name: string) => {
  setSegments((prev) => {
    const newId = nextSpeakerId(prev);
    if (name.trim()) {
      setSpeakerNames((sn) => ({ ...sn, [newId]: name.trim() }));
    }
    return reassignSegments(prev, segmentIds, newId);
  });
}, []);
```

Import at the top of the file:

```typescript
import { nextSpeakerId, reassignSegments } from '@/lib/speaker-utils';
```

- [ ] **Step 2: Export both from the returned object**

In the `return { … }` block, alongside `renameSpeaker`, add:

```typescript
reassignSpeaker,
createSpeakerAndReassign,
```

- [ ] **Step 3: Run build and existing tests**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm build 2>&1 | head -30
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm test 2>&1 | tail -15
```

Expected: build clean (or only unrelated errors), all existing tests still pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto
git add src/hooks/use-transcription.ts
git commit -m "feat(use-transcription): expose reassignSpeaker + createSpeakerAndReassign"
```

---

## Task 3: TranscriptPanel Select Mode UI

**Files:**
- Modify: `src/components/transcript-panel.tsx`
- (Optional) Run shadcn add for `Checkbox`, `Popover`, `Command` if not present

- [ ] **Step 1: Verify shadcn components are present**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto && ls src/components/ui/ | grep -E 'checkbox|popover|command'
```

If any are missing, add them via shadcn CLI:

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm dlx shadcn@latest add checkbox popover command
```

- [ ] **Step 2: Extend `TranscriptPanelProps`**

In `src/components/transcript-panel.tsx`, update the props interface:

```typescript
interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  speakerNames: Record<string, string>;
  onRenameSpeaker: (speakerId: string, name: string) => void;
  onUpdateText?: (id: string, text: string) => void;
  onDeleteSegment?: (id: string) => void;
  correctingIds?: Set<string>;
  onReassignSpeaker?: (segmentIds: Set<string>, targetSpeakerId: string) => void;
  onCreateSpeakerAndReassign?: (segmentIds: Set<string>, name: string) => void;
  disableSelectMode?: boolean;
  disableSelectModeReason?: string;
}
```

- [ ] **Step 3: Add Select Mode state, action bar, picker, checkbox-per-segment**

Inside the `TranscriptPanel` function add:

```typescript
const [selectMode, setSelectMode] = useState(false);
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [pickerOpen, setPickerOpen] = useState(false);
const [creatingNew, setCreatingNew] = useState(false);
```

Implement:
- An "Enter Select Mode" button rendered at the top of the panel (only when `onReassignSpeaker` is provided). Disabled when `disableSelectMode || segments.every(s => !s.speakerId)`.
- An action bar visible only when `selectMode` is true, with: selection count, "Select all" (selects every segment that has a `speakerId`), "Clear", "Reassign to…" (disabled when `selectedIds.size === 0`), "Cancel".
- Esc key handler that exits Select Mode.
- Per-segment checkbox in the left column when `selectMode && segment.speakerId`. Toggling adds/removes from `selectedIds`.
- In Select Mode, the speaker label and segment text become non-interactive (click toggles the row's checkbox instead). Collapse rule is suppressed: every segment renders its full label.
- The Reassign popover (shadcn `Popover` + `Command`): one row per unique `speakerId` in `segments` (in first-appearance order), plus a "+ New speaker" item. Picking an existing row calls `onReassignSpeaker(selectedIds, id)` then exits Select Mode. Picking "+ New speaker" swaps the row for an inline input; Enter calls `onCreateSpeakerAndReassign(selectedIds, value)`; Esc reverts.

Refactor pointers (preserve existing behaviour outside Select Mode):
- If a collapse rule (e.g. `isSameSpeakerAsPrev`) exists in the file, it must be skipped when `selectMode` is true. On the current base (origin/main as of 2026-06-16) no collapse rule exists, so this is a forward-looking note.
- The existing `SpeakerLabel` `onClick` and `EditableText` `startEditing` must early-return when `selectMode` is true (route to checkbox toggle instead).

- [ ] **Step 4: Run build**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm build 2>&1 | head -30
```

Expected: build clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto
git add src/components/transcript-panel.tsx src/components/ui/checkbox.tsx src/components/ui/popover.tsx src/components/ui/command.tsx
git commit -m "feat(transcript-panel): add Select Mode with checkbox selection and reassign popover"
```

---

## Task 4: Wire into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Destructure the new callbacks**

In the `useTranscription({…})` destructuring (around line 87), add:

```typescript
reassignSpeaker,
createSpeakerAndReassign,
```

- [ ] **Step 2: Compute the disabled state and tooltip**

Just before the JSX `return`, add:

```typescript
const disableSelectMode = recordingState !== 'idle';
const disableSelectModeReason = disableSelectMode
  ? 'Stop recording to reassign speakers'
  : undefined;
```

- [ ] **Step 3: Pass props down to both TranscriptPanel render sites**

Both the split-pane and main-tab `TranscriptPanel` calls (around lines 586 and 636) receive:

```typescript
onReassignSpeaker={reassignSpeaker}
onCreateSpeakerAndReassign={createSpeakerAndReassign}
disableSelectMode={disableSelectMode}
disableSelectModeReason={disableSelectModeReason}
```

- [ ] **Step 4: Run build + tests**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm build 2>&1 | head -30
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm test 2>&1 | tail -15
```

Expected: build clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto
git add src/App.tsx
git commit -m "feat(app): wire reassign callbacks to TranscriptPanel select mode"
```

---

## Task 5: Manual Verification

- [ ] **Step 1: Start the app**

```bash
cd /Users/axelr/Code/CookieMonster42/Transcripto && pnpm dev
```

- [ ] **Step 2: Import or record a diarized transcript with at least two speakers and at least one collapsed-consecutive-same-speaker run**

(Use file import with diarization enabled, or a short live recording with mic + system audio if convenient.)

- [ ] **Step 3: Verify the golden paths**

- "Select" button is visible and enabled after diarization.
- Entering Select Mode shows checkboxes and expands collapsed labels.
- Single-segment select + reassign to an existing speaker works; only the selected segment changes.
- Multi-select + reassign to existing speaker works; collapse re-evaluates correctly afterwards.
- "+ New speaker" with a name creates a new `speaker_N`, names it, and reassigns the selection.
- "+ New speaker" with empty name creates an unnamed `speaker_N`.
- Esc cancels Select Mode without changes.

- [ ] **Step 4: Verify the disabled-state paths**

- Start a new recording. Select button is disabled with tooltip "Stop recording to reassign speakers".
- Dismiss the transcript and load a non-diarized one. Select button is disabled with tooltip "Enable diarization to reassign speakers".

- [ ] **Step 5: Verify persistence and export**

- Reassign segments, reload the app, confirm reassignments persist.
- Save the transcript to Markdown, open the file, confirm speaker names follow the reassigned identities.

---

## Out of Scope (carried from spec)

- Free per-segment labels (Override C in the grilling session).
- Reassignment during live recording.
- Undo for reassignment.
- Cmd-A, Shift-range, drag-and-drop.
- Manual labeling on non-diarized transcripts.
- Auto-cleanup of orphaned speaker IDs.
