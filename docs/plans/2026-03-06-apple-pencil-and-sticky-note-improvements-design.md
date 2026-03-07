# Apple Pencil & Sticky Note Improvements — Design

**Date:** 2026-03-06
**Status:** Approved

---

## Problem Summary

Five issues with Apple Pencil UX and sticky note behavior:

1. Copy/paste popup appears briefly mid-stroke, interrupting writing flow
2. Apple Pencil double tap / squeeze do not fire (silent listener registration failure)
3. Tilt/angle has no visible effect on line width (multipliers too subtle)
4. Ink strokes remain visible over a collapsed sticky note's area
5. After placing a sticky note, the user must manually switch back to pen

---

## Issue 1: Copy/Paste Popup During Writing

### Root Cause

The popup appears mid-stroke because:
- The only contextmenu prevention is React's `onContextMenu` on `.planner-stage`, which relies on synthetic event bubbling and may fire after iOS has already decided to show the callout
- There is no `contextmenu` listener directly on the `.planner-paper` surface element
- At the WKWebView (native) level, iOS long-press selection UI can appear regardless of CSS `touch-callout: none` in certain scenarios

### Fix

**Web layer** (`src/planner/InkLayer.tsx` useEffect):
- Add `surface.addEventListener('contextmenu', onContextMenu)` where `onContextMenu` calls `event.preventDefault()`
- Add `document.addEventListener('contextmenu', onDocumentContextMenu, { capture: true })` as a catch-all; only prevents if the event target is inside a `.planner-paper` element

**Native layer** (`ios/App/App/PlannerBridgeViewController.swift`):
- After `capacitorDidLoad`, get a reference to the WKWebView via `bridge?.webView`
- Set `webView.allowsLinkPreview = false`
- Inject a `WKUserScript` that runs at `documentStart` in all frames:
  ```js
  document.addEventListener('contextmenu', function(e) { e.preventDefault(); }, { capture: true, passive: false });
  document.addEventListener('selectstart', function(e) { e.preventDefault(); }, { capture: true, passive: false });
  ```

---

## Issue 2: Apple Pencil Double Tap / Squeeze Not Firing

### Root Cause

In `App.tsx`, `registerApplePencilListeners` calls `getCapabilities()` first inside a try/catch. If that call throws for any reason (timing, plugin not yet ready, etc.), the catch block silently swallows the error and `addListener` calls never run. The listeners are never registered.

### Fix

Restructure `registerApplePencilListeners`:
1. Register `pencilTap` and `pencilSqueeze` listeners **first**, unconditionally
2. Then call `getCapabilities()` separately to read `preferredTapAction`
3. Route tap/squeeze actions based on `preferredTapAction`:
   - `switchEraser` → `toggleEraserFromPencilDoubleTap()` (existing behavior)
   - `switchPrevious` → switch to previous non-eraser tool
   - `showColorPalette` / `showInkAttributes` → no-op for now (toolbar is always visible)
   - `ignore` → do nothing
   - unknown / default → `toggleEraserFromPencilDoubleTap()` as fallback

Store `preferredTapAction` in a ref so the listener closure always reads the latest value. Works gracefully for all pencil models — Pencil 1 and USB-C simply never fire the event.

---

## Issue 3: Tilt Does Not Visibly Affect Line Width

### Root Cause

The tilt math is implemented correctly (`normalizedTiltAmount` → `tipTiltFactor`). The multipliers are too subtle to notice in practice:
- fine tip max: +16%
- chisel tip max: +44%

### Fix

Increase tilt multipliers for a more tactile, visible response:

| Tip | Current max increase | New max increase |
|---|---|---|
| fine | 16% | 35% |
| fountain | 22% | 50% |
| marker | 30% | 55% |
| chisel | 44% | 70% |
| default | 24% | 45% |

No data pipeline changes needed — tiltX/tiltY values from Apple Pencil are reported correctly through WKWebView Pointer Events on iOS 13.4+.

---

## Issue 4: Ink Stays Visible Over Collapsed Sticky Notes

### Root Cause

The ink canvas covers the entire `.planner-paper` element. Strokes are drawn globally and have no knowledge of sticky note boundaries. When a note collapses, strokes in its area remain visible.

### Fix

During canvas redraw in InkLayer, apply an `evenodd` clip path before drawing strokes:
- Draw a full-canvas rect
- For each collapsed sticky note, add its bounding rect as a counter-clockwise sub-path
- Set clip with `evenodd` fill rule — this excludes collapsed note areas from rendering

The ink data is preserved and unchanged. The masking is purely a rendering layer applied during each redraw. When a note expands, `redraw()` is called and the exclusion for that note is removed.

InkLayer already has access to `stickiesRef.current` (positions, sizes, collapsed state) within the redraw closure, so no new data flow is needed.

---

## Issue 5: Auto-Switch to Pen After Placing Sticky Note

### Fix

- Add `onStickyNoteCreated?: () => void` prop to `InkLayer`
- Fire it in `onStart` immediately after a new sticky note is inserted into `stickiesRef`
- In `App.tsx`:
  - Track `lastDrawingToolRef` — updated whenever `activeTool` changes to a drawing tool (pen, eraser, fine, etc.) but not to sticky
  - In the `onStickyNoteCreated` handler, call `setActiveTool(lastDrawingToolRef.current)`

Result: place a sticky → tool immediately returns to pen → user can write without visiting the toolbar.

---

## Files Changed

| File | Change |
|---|---|
| `src/planner/InkLayer.tsx` | Add surface + document `contextmenu` listeners; increase tilt multipliers; add collapsed-note canvas clip during redraw; add `onStickyNoteCreated` prop + firing |
| `src/App.tsx` | Fix `registerApplePencilListeners` registration order; add `preferredTapAction` routing; track `lastDrawingToolRef`; handle `onStickyNoteCreated` |
| `ios/App/App/PlannerBridgeViewController.swift` | Set `allowsLinkPreview = false`; inject contextmenu/selectstart suppression `WKUserScript` |
