# Apple Pencil & Sticky Note Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix copy/paste popup mid-stroke, make Apple Pencil double tap/squeeze reliable with correct action routing, make tilt visibly affect line width, hide ink over collapsed sticky notes, and auto-switch to pen after placing a sticky note.

**Architecture:** All web changes live in `src/planner/InkLayer.tsx` (rendering, events, new prop) and `src/App.tsx` (pencil listener, tool tracking). The native fix lives in `ios/App/App/PlannerBridgeViewController.swift`. No new files needed.

**Tech Stack:** React 18, TypeScript, Canvas 2D API, Capacitor 6, WKWebView, Swift, UIKit

---

## Task 1: Fix Copy/Paste Popup — Web Layer

**Files:**
- Modify: `src/planner/InkLayer.tsx:2866-2900` (event listener setup/teardown in `useEffect`)

The surface already has `pointerdown`/`pointermove`/`pointerup` native listeners registered here but no `contextmenu` listener. The React `onContextMenu` on the parent `.planner-stage` is the only guard, and it fires after iOS may already have committed to showing the callout.

**Step 1: Add `contextmenu` and `selectstart` listeners to the surface**

In the `useEffect` that registers surface event listeners (starts around line 2866), add after the existing `surface.addEventListener("pointerdown", ...)` calls:

```ts
const onContextMenu = (event: Event) => {
  event.preventDefault();
};
const onSelectStart = (event: Event) => {
  event.preventDefault();
};
surface.addEventListener("contextmenu", onContextMenu);
surface.addEventListener("selectstart", onSelectStart);
```

**Step 2: Clean up the new listeners in the return cleanup**

In the same `useEffect` cleanup block (around line 2882), add:

```ts
surface.removeEventListener("contextmenu", onContextMenu);
surface.removeEventListener("selectstart", onSelectStart);
```

**Step 3: Add a document-level capture guard**

Immediately after declaring `onContextMenu` (before registering on surface), also register on `document` as a capture-phase catch-all that only fires when the event is inside a `.planner-paper`:

```ts
const onDocumentContextMenu = (event: Event) => {
  if (
    event.target instanceof Node &&
    surface.contains(event.target)
  ) {
    event.preventDefault();
  }
};
document.addEventListener("contextmenu", onDocumentContextMenu, { capture: true });
```

Add corresponding cleanup:
```ts
document.removeEventListener("contextmenu", onDocumentContextMenu, { capture: true });
```

**Step 4: Verify no TypeScript errors**

```bash
cd /Users/dustinschaaf/Code/planner-generator && npx tsc --noEmit
```
Expected: no errors.

**Step 5: Commit**

```bash
git add src/planner/InkLayer.tsx
git commit -m "fix: suppress contextmenu and selectstart on ink surface to prevent iOS copy/paste popup"
```

---

## Task 2: Fix Copy/Paste Popup — Native WKWebView Layer

**Files:**
- Modify: `ios/App/App/PlannerBridgeViewController.swift`

The WKWebView itself can show selection/callout UI before any JS fires. Setting `allowsLinkPreview = false` and injecting a `WKUserScript` at document start eliminates the popup at the source.

**Step 1: Add WKWebKit import**

At the top of `PlannerBridgeViewController.swift`, ensure `WebKit` is imported (Capacitor usually imports it transitively, but be explicit):

```swift
import UIKit
import Capacitor
import WebKit
```

**Step 2: Override `capacitorDidLoad` to configure WKWebView**

Replace the existing `capacitorDidLoad` body with:

```swift
override open func capacitorDidLoad() {
    bridge?.registerPluginType(ApplePencilPlugin.self)
    configureWebView()
}

private func configureWebView() {
    guard let webView = bridge?.webView else { return }

    // Disable link preview long-press (suppresses callout on links/images)
    webView.allowsLinkPreview = false

    // Inject contextmenu + selectstart suppression before any page JS runs
    let script = """
    (function() {
        function suppress(e) { e.preventDefault(); }
        document.addEventListener('contextmenu', suppress, { capture: true, passive: false });
        document.addEventListener('selectstart', suppress, { capture: true, passive: false });
    })();
    """
    let userScript = WKUserScript(
        source: script,
        injectionTime: .atDocumentStart,
        forMainFrameOnly: false
    )
    webView.configuration.userContentController.addUserScript(userScript)
}
```

**Step 3: Build the iOS target to verify it compiles**

Open Xcode or run:
```bash
cd /Users/dustinschaaf/Code/planner-generator/ios/App && xcodebuild -scheme App -destination 'generic/platform=iOS' build CODE_SIGNING_ALLOWED=NO 2>&1 | tail -20
```
Expected: `BUILD SUCCEEDED`

**Step 4: Commit**

```bash
git add ios/App/App/PlannerBridgeViewController.swift
git commit -m "fix: disable WKWebView link preview and inject contextmenu suppression script to kill iOS copy/paste popup"
```

---

## Task 3: Fix Apple Pencil Double Tap / Squeeze

**Files:**
- Modify: `src/App.tsx:749-799` (the `useEffect` that registers pencil listeners)

**Root cause:** `getCapabilities()` is called first inside a try/catch. If it throws, the catch swallows the error and `addListener` calls never run — so tap and squeeze are silently never registered.

**Step 1: Read the current state of the pencil listener block**

The block at `src/App.tsx:749-799` currently:
1. Calls `getCapabilities()` first (line 760)
2. Only registers listeners if that succeeds
3. All tap/squeeze events call `toggleEraserFromPencilDoubleTap()` regardless of `preferredTapAction`

**Step 2: Add a `preferredTapActionRef` to hold the live preferred action**

Just above `const lastNonEraserToolRef = useRef<InkTool>("pen");` (line 551), add:

```ts
const preferredPencilActionRef = useRef<string>("switchEraser");
```

**Step 3: Add a `switchToPreviousTool` helper near `toggleEraserFromPencilDoubleTap` (around line 735)**

```ts
const switchToPreviousTool = useCallback(() => {
  setActiveTool(lastNonEraserToolRef.current === "eraser" ? "pen" : lastNonEraserToolRef.current);
  setActiveSymbol("");
}, []);
```

**Step 4: Add a `handlePencilAction` helper that routes based on `preferredPencilActionRef`**

```ts
const handlePencilAction = useCallback(() => {
  const action = preferredPencilActionRef.current;
  if (action === "ignore") {
    return;
  }
  if (action === "switchPrevious") {
    switchToPreviousTool();
    return;
  }
  // switchEraser, showColorPalette, showInkAttributes, showContextualPalette,
  // runSystemShortcut, unknown — all default to eraser toggle
  toggleEraserFromPencilDoubleTap();
}, [switchToPreviousTool, toggleEraserFromPencilDoubleTap]);
```

**Step 5: Rewrite `registerApplePencilListeners` to register listeners first**

Replace the existing `registerApplePencilListeners` function (lines 758-787) with:

```ts
const registerApplePencilListeners = async () => {
  // Register listeners first — do NOT gate on getCapabilities()
  // A failing capability check previously silently prevented listeners from ever registering.
  try {
    const tapHandle = await applePencilPlugin.addListener(
      "pencilTap",
      () => {
        if (canceled) return;
        handlePencilAction();
      },
    );
    listenerHandles.push(tapHandle);
  } catch {
    // Pencil tap not supported on this model/OS (Pencil 1, USB-C).
  }

  try {
    const squeezeHandle = await applePencilPlugin.addListener(
      "pencilSqueeze",
      (event) => {
        if (canceled) return;
        if (event.phase === "changed" || event.phase === "began") return;
        handlePencilAction();
      },
    );
    listenerHandles.push(squeezeHandle);
  } catch {
    // Squeeze not supported on this model/OS (Pencil 1, Pencil 2, USB-C).
  }

  // Read capabilities separately — failure here does not break listeners
  try {
    const caps = await applePencilPlugin.getCapabilities();
    if (!canceled && caps.preferredTapAction) {
      preferredPencilActionRef.current = caps.preferredTapAction;
    }
  } catch {
    // Capabilities unavailable — keep default "switchEraser" behavior.
  }
};
```

**Step 6: Update the `useEffect` dependency array** (line 799)

Change `}, [toggleEraserFromPencilDoubleTap]);` to:
```ts
}, [handlePencilAction]);
```

**Step 7: Verify TypeScript**

```bash
cd /Users/dustinschaaf/Code/planner-generator && npx tsc --noEmit
```
Expected: no errors.

**Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "fix: register Apple Pencil listeners before getCapabilities so double tap/squeeze reliably fires; route action by preferredTapAction"
```

---

## Task 4: Increase Tilt Effect on Line Width

**Files:**
- Modify: `src/planner/InkLayer.tsx:287-314` (the `tipTiltFactor` function)

The tilt math is correct but the multipliers are too small to notice. Increasing them makes the effect visible when the pencil is held at an angle.

**Step 1: Update the multipliers in `tipTiltFactor`**

Replace the body of `tipTiltFactor` (lines 292-313). Current values → new values:

```ts
function tipTiltFactor(
  tip: InkTipKind,
  previousPoint: InkPoint,
  currentPoint: InkPoint,
): number {
  const tilt = segmentTiltAmount(previousPoint, currentPoint);
  if (tilt <= 0.0001) {
    return 1;
  }

  if (tip === "fine") {
    return 1 + tilt * 0.35;      // was 0.16
  }

  if (tip === "fountain") {
    return 1 + tilt * 0.50;      // was 0.22
  }

  if (tip === "marker") {
    return 1 + tilt * 0.55;      // was 0.30
  }

  if (tip === "chisel") {
    return 1 + tilt * 0.70;      // was 0.44
  }

  return 1 + tilt * 0.45;        // was 0.24
}
```

**Step 2: Verify TypeScript**

```bash
cd /Users/dustinschaaf/Code/planner-generator && npx tsc --noEmit
```
Expected: no errors.

**Step 3: Commit**

```bash
git add src/planner/InkLayer.tsx
git commit -m "feat: increase tilt multipliers for visible angle-based line width variation"
```

---

## Task 5: Hide Ink Over Collapsed Sticky Notes

**Files:**
- Modify: `src/planner/InkLayer.tsx:1450-1453` (start of the `redraw` function)

When a sticky note is collapsed, any ink drawn over its area should be invisible. The fix is an `evenodd` canvas clip applied at the start of each redraw that excludes collapsed note bounding boxes.

**Context:** `stickiesRef.current` is accessible inside the `redraw` closure because it's defined in the same component scope. `dprRef.current` holds the device pixel ratio used to scale canvas coordinates.

**Step 1: Add a helper that applies the collapsed-note mask**

Add this helper function just before the `redraw` function definition (around line 1450):

```ts
const applyCollapsedNoteMask = (ctx: CanvasRenderingContext2D, dpr: number) => {
  const collapsed = stickiesRef.current.filter((s) => s.collapsed);
  if (collapsed.length === 0) return;

  ctx.save();
  ctx.beginPath();
  // Full canvas rect (clockwise)
  ctx.rect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);
  // Each collapsed note rect (also clockwise — evenodd rule makes these holes)
  for (const note of collapsed) {
    ctx.rect(note.x, note.y, note.width, note.height);
  }
  ctx.clip("evenodd");
  // Note: ctx.restore() must be called AFTER all drawing; caller is responsible.
};
```

**Step 2: Wrap the entire redraw drawing section with the mask**

Inside `redraw()`, after `ctx.clearRect(...)` (line 1453) and before the first `for` loop over `fillsRef.current`, add:

```ts
const hasCollapsed = stickiesRef.current.some((s) => s.collapsed);
if (hasCollapsed) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, metrics.width, metrics.height);
  for (const note of stickiesRef.current.filter((s) => s.collapsed)) {
    ctx.rect(note.x, note.y, note.width, note.height);
  }
  ctx.clip("evenodd");
}
```

Then find the end of the `redraw` function (right before `redrawRef.current = redraw;` at line 1638) and add the matching restore:

```ts
if (hasCollapsed) {
  ctx.restore();
}
```

**Step 3: Verify TypeScript**

```bash
cd /Users/dustinschaaf/Code/planner-generator && npx tsc --noEmit
```
Expected: no errors.

**Step 4: Manual verification logic**

- Place a sticky note
- Draw some ink strokes over the sticky note area
- Collapse the sticky note → the ink over the note area disappears
- Expand the sticky note → the ink reappears

**Step 5: Commit**

```bash
git add src/planner/InkLayer.tsx
git commit -m "feat: mask ink strokes under collapsed sticky notes using evenodd canvas clip"
```

---

## Task 6: Auto-Switch to Drawing Tool After Placing Sticky Note

**Files:**
- Modify: `src/planner/InkLayer.tsx:1241-1255` (InkLayer function signature / props)
- Modify: `src/planner/InkLayer.tsx:2206-2229` (sticky note creation in `onStart`)
- Modify: `src/planner/MonthlyView.tsx` (pass new prop to InkLayer)
- Modify: `src/App.tsx` (track last drawing tool, handle `onStickyNoteCreated`)

**Step 1: Add `onStickyNoteCreated` to InkLayer's function parameters**

The `InkLayer` component uses a destructured props pattern in its function signature at line 1241. Add `onStickyNoteCreated` after `onInputType`:

```ts
export default function InkLayer({
  pageId,
  allowTouch = false,
  onInputType,
  onStickyNoteCreated,   // ← add this
  color = "#2f2b2a",
  ...
```

The function doesn't use a separate `interface` — just add `onStickyNoteCreated?: () => void` inline to the destructured parameter. In TypeScript, you can add a type annotation to the destructuring:

Find the function signature and add `onStickyNoteCreated?: () => void` as a new destructured parameter.

**Step 2: Fire `onStickyNoteCreated` after sticky is added**

In the `activeMode === "sticky"` block (lines 2206-2229), after `setStickyNotes(nextStickies)` (line 2224), add:

```ts
runtimeConfig.onStickyNoteCreated?.();
```

Wait — `onStickyNoteCreated` is a prop but `runtimeConfig` holds the mutable runtime config ref. Check how `onInputType` is accessed — it's via `runtimeConfig.onInputType?.(...)` at line 2069. The `runtimeConfig` ref is populated from props. Follow that same pattern.

First, find where `runtimeConfig` is defined and how it includes `onInputType`. Search for `runtimeConfig` in InkLayer.tsx to find the ref initialization.

**Step 2a: Find the runtimeConfig ref definition**

```bash
grep -n "runtimeConfig\|runtimeConfigRef" /Users/dustinschaaf/Code/planner-generator/src/planner/InkLayer.tsx | head -20
```

Then add `onStickyNoteCreated` to that config object so it follows the same live-update pattern as `onInputType`.

**Step 2b: Fire the callback after sticky is created**

After `setStickyNotes(nextStickies);` (around line 2224), add:

```ts
runtimeConfig.onStickyNoteCreated?.();
```

**Step 3: Add `lastDrawingToolRef` in App.tsx**

Just below `lastNonEraserToolRef` (line 551), add:

```ts
const lastDrawingToolRef = useRef<InkTool>("pen");
```

**Step 4: Keep `lastDrawingToolRef` current**

In the existing `useEffect` that tracks `activeTool` (around line 648 where `lastNonEraserToolRef` is updated), also update `lastDrawingToolRef` when the tool is a drawing tool (not sticky/eraser/lasso/etc.):

```ts
useEffect(() => {
  if (activeTool !== "eraser") {
    lastNonEraserToolRef.current = activeTool;
  }
  if (
    activeTool === "pen" ||
    activeTool === "pencil" ||
    activeTool === "highlighter" ||
    activeTool === "shape"
  ) {
    lastDrawingToolRef.current = activeTool;
  }
}, [activeTool]);
```

**Step 5: Add `handleStickyNoteCreated` callback in App.tsx**

Near `toggleEraserFromPencilDoubleTap` (around line 735), add:

```ts
const handleStickyNoteCreated = useCallback(() => {
  setActiveTool(lastDrawingToolRef.current);
}, []);
```

**Step 6: Pass `onStickyNoteCreated` through MonthlyView to InkLayer**

The call chain is: `App.tsx` → `MonthlyView` (via props) → `InkLayer` (via props).

In `src/planner/MonthlyView.tsx`, find the `MonthlyViewProps` interface (around line 13) and add:
```ts
onStickyNoteCreated?: () => void;
```

In the `MonthlyView` component function destructuring (around line 333), add `onStickyNoteCreated` to the destructured props.

Find every `<InkLayer` usage in `MonthlyView.tsx` and pass the prop through:
```tsx
<InkLayer
  ...
  onStickyNoteCreated={onStickyNoteCreated}
/>
```

In `App.tsx`, find the `<MonthlyView` component usage (around line 1789) and add:
```tsx
onStickyNoteCreated={handleStickyNoteCreated}
```

**Step 7: Verify TypeScript**

```bash
cd /Users/dustinschaaf/Code/planner-generator && npx tsc --noEmit
```
Expected: no errors.

**Step 8: Commit**

```bash
git add src/planner/InkLayer.tsx src/planner/MonthlyView.tsx src/App.tsx
git commit -m "feat: auto-switch to last drawing tool after placing a sticky note"
```

---

## Final Build Check

```bash
cd /Users/dustinschaaf/Code/planner-generator && npm run build
```
Expected: build completes without errors.

---

## Task Order Summary

1. **Task 1** — Contextmenu/selectstart on ink surface (web)
2. **Task 2** — WKWebView native suppression (Swift)
3. **Task 3** — Pencil double tap/squeeze listener fix + action routing
4. **Task 4** — Tilt multipliers (one-function change)
5. **Task 5** — Collapsed sticky note ink mask
6. **Task 6** — Auto-switch to pen after sticky placement
