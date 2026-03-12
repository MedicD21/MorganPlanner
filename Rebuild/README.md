# OnPurpose Planner Native (iPad)

Fresh native SwiftUI + PencilKit rebuild of the planner app.

This project is intentionally independent from the existing Capacitor iOS target and was created from scratch in `Rebuild/`.

## What it includes

- Native iPad SwiftUI layout matching the existing planner concepts:
  - Month + week spread
  - Planning spread
  - Notes spread
- Floating toolbar (side/top, collapse, quick slots, more panel)
- Drawing stack via PencilKit with Apple Pencil support
- Tool modes: pen, pencil, highlighter, eraser, lasso, shape, bucket fill, symbol/text/image stamps, sticky notes
- Per-page persistence (drawings + overlays)
- Undo/redo (active page), zoom controls, month/week navigation
- Apple Pencil double tap / squeeze action routing

## Build

From `Rebuild/`:

```bash
xcodegen generate
xcodebuild -project OnPurposePlannerNative.xcodeproj -scheme OnPurposePlannerNative -destination 'generic/platform=iOS' build CODE_SIGNING_ALLOWED=NO
```

