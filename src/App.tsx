import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import "./App.css";
import MonthlyView from "./planner/MonthlyView";
import { generateCalendar } from "./planner/generateCalendar";
import FloatingToolbar from "./toolbar/FloatingToolbar";
import {
  clampStrokeSize,
  isDrawingTool,
  isHexColor,
  normalizeInkTip,
  PLANNER_UNDO_EVENT,
  PLANNER_REDO_EVENT,
  ACTIVE_INK_PAGE_KEY,
  ACTIVE_STAGE_TOUCH_COUNT_KEY,
  type DrawingTool,
  type FavoriteStyle,
  type InkShapeKind,
  type InkTipKind,
  type InkTool,
} from "./planner/plannerShared";

const _todayInit = new Date();
const DEFAULT_YEAR = _todayInit.getFullYear();
const DEFAULT_MONTH = _todayInit.getMonth() + 1;

function computeCurrentWeekIndex(year: number, month: number): number {
  const today = new Date();
  if (today.getFullYear() !== year || today.getMonth() + 1 !== month) {
    return 0;
  }
  const calendar = generateCalendar(year, month);
  const todayDate = today.getDate();
  const idx = calendar.weeks.findIndex((week) =>
    week.some((cell) => cell.inMonth && cell.dayNumber === todayDate && cell.month === month),
  );
  return idx >= 0 ? idx : 0;
}

const DEFAULT_WEEK_INDEX = computeCurrentWeekIndex(DEFAULT_YEAR, DEFAULT_MONTH);
const DEFAULT_COLOR = "#2f2b2a";
const DEFAULT_STROKE_SIZE = 2.1;
const FAVORITE_COLOR_LIMIT = 12;
const FAVORITE_STYLE_LIMIT = 8;
const FAVORITE_COLORS_STORAGE_KEY = "planner-favorite-colors-v1";
const FAVORITE_STYLES_STORAGE_KEY = "planner-favorite-styles-v1";
const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 2.8;
const PENCIL_DOUBLE_TAP_MS = 340;
const THREE_FINGER_TAP_MAX_MS = 340;
const THREE_FINGER_DOUBLE_TAP_MS = 520;
const THREE_FINGER_MAX_MOVE = 26;

interface ApplePencilTapEvent {
  timestamp: number;
  preferredAction?: string;
  hoverPose?: {
    locationX: number;
    locationY: number;
    zOffset: number;
    azimuthAngle: number;
    altitudeAngle: number;
    rollAngle: number;
  } | null;
}

interface ApplePencilSqueezeEvent {
  timestamp: number;
  phase?: string;
  preferredAction?: string;
  hoverPose?: {
    locationX: number;
    locationY: number;
    zOffset: number;
    azimuthAngle: number;
    altitudeAngle: number;
    rollAngle: number;
  } | null;
}

interface ApplePencilCapabilities {
  available: boolean;
  supportsTap: boolean;
  supportsSqueeze: boolean;
  prefersPencilOnlyDrawing: boolean;
  preferredTapAction: string;
  preferredSqueezeAction: string;
  prefersHoverToolPreview: boolean;
}

interface ApplePencilPlugin {
  addListener(
    eventName: "pencilTap",
    listener: (event: ApplePencilTapEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "pencilSqueeze",
    listener: (event: ApplePencilSqueezeEvent) => void,
  ): Promise<PluginListenerHandle>;
  getCapabilities(): Promise<ApplePencilCapabilities>;
}

interface TouchPoint {
  x: number;
  y: number;
}

interface PinchGestureState {
  startDistance: number;
  startScale: number;
  startTranslateX: number;
  startTranslateY: number;
  startRectLeft: number;
  startRectTop: number;
  contentX: number;
  contentY: number;
}

interface TouchGestureMeta {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  startTime: number;
}

interface ThreeFingerTapCandidate {
  pointerIds: number[];
  startTime: number;
  centerX: number;
  centerY: number;
  maxMove: number;
}

interface PlannerHistoryEventDetail {
  targetPageId: string | null;
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function clampValue(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isLikelyStylusPointerEvent(
  event: ReactPointerEvent<HTMLElement>,
): boolean {
  if (event.pointerType === "pen") {
    return true;
  }

  const nativeEvent = event.nativeEvent as PointerEvent & {
    touchType?: string;
  };
  if (nativeEvent.touchType === "stylus") {
    return true;
  }
  return false;
}

function getEventTargetElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  if (target instanceof Node) {
    return target.parentElement;
  }
  return null;
}

function getClosestInteractiveControl(target: EventTarget | null): HTMLElement | null {
  const element = getEventTargetElement(target);
  if (!element) {
    return null;
  }

  const closest = element.closest(
    "button, a, input, select, label, textarea, [role='button']",
  );
  return closest instanceof HTMLElement ? closest : null;
}

function shouldSkipStageTouchTracking(target: EventTarget | null): boolean {
  return getClosestInteractiveControl(target) !== null;
}

function loadFavoriteColors(): string[] {
  const raw = readStorage<unknown>(FAVORITE_COLORS_STORAGE_KEY, []);
  if (!Array.isArray(raw)) {
    return [];
  }

  const unique: string[] = [];
  for (const value of raw) {
    if (typeof value !== "string") {
      continue;
    }

    const normalized = value.toLowerCase();
    if (!isHexColor(normalized) || unique.includes(normalized)) {
      continue;
    }
    unique.push(normalized);

    if (unique.length >= FAVORITE_COLOR_LIMIT) {
      break;
    }
  }

  return unique;
}

function loadFavoriteStyles(): FavoriteStyle[] {
  const raw = readStorage<unknown>(FAVORITE_STYLES_STORAGE_KEY, []);
  if (!Array.isArray(raw)) {
    return [];
  }

  const validTools = new Set<DrawingTool>([
    "pen",
    "pencil",
    "highlighter",
    "shape",
  ]);
  const styles: FavoriteStyle[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Partial<FavoriteStyle>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.tool !== "string" ||
      !validTools.has(candidate.tool as DrawingTool) ||
      typeof candidate.color !== "string" ||
      !isHexColor(candidate.color) ||
      typeof candidate.size !== "number"
    ) {
      continue;
    }

    styles.push({
      id: candidate.id,
      tool: candidate.tool as DrawingTool,
      color: candidate.color.toLowerCase(),
      size: clampStrokeSize(candidate.size),
      tip: normalizeInkTip(candidate.tip),
    });

    if (styles.length >= FAVORITE_STYLE_LIMIT) {
      break;
    }
  }

  return styles;
}

function makeFavoriteStyle(
  tool: DrawingTool,
  color: string,
  size: number,
  tip: InkTipKind,
): FavoriteStyle {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tool,
    color: color.toLowerCase(),
    size: clampStrokeSize(size),
    tip: normalizeInkTip(tip),
  };
}

export default function App() {
  const [year, setYear] = useState<number>(DEFAULT_YEAR);
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [weekIndex, setWeekIndex] = useState<number>(DEFAULT_WEEK_INDEX);
  const [allowTouchInk, setAllowTouchInk] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<InkTool>("pen");
  const [activeColor, setActiveColor] = useState<string>(DEFAULT_COLOR);
  const [strokeSize, setStrokeSize] = useState<number>(DEFAULT_STROKE_SIZE);
  const [activeTip, setActiveTip] = useState<InkTipKind>("round");
  const [activeSymbol, setActiveSymbol] = useState<string>("");
  const [shapeKind, setShapeKind] = useState<InkShapeKind>("line");
  const [textStamp, setTextStamp] = useState<string>("note");
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [zoomOffset, setZoomOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [activeStageTouchCount, setActiveStageTouchCount] = useState<number>(0);
  const [imageStampSrc, setImageStampSrc] = useState<string | null>(null);
  const [favoriteColors, setFavoriteColors] = useState<string[]>(
    loadFavoriteColors,
  );
  const [favoriteStyles, setFavoriteStyles] = useState<FavoriteStyle[]>(
    loadFavoriteStyles,
  );
  const plannerStageRef = useRef<HTMLDivElement | null>(null);
  const zoomSurfaceRef = useRef<HTMLDivElement | null>(null);
  const lastNonEraserToolRef = useRef<InkTool>("pen");
  const preferredPencilActionRef = useRef<string>("switchEraser");
  const lastDrawingToolRef = useRef<InkTool>("pen");
  const activeStylusPointerRef = useRef<boolean>(false);
  const activeTouchPointsRef = useRef<Map<number, TouchPoint>>(new Map());
  const touchGestureMetaRef = useRef<Map<number, TouchGestureMeta>>(new Map());
  const pinchGestureRef = useRef<PinchGestureState | null>(null);
  const activeThreeFingerTapRef = useRef<ThreeFingerTapCandidate | null>(null);
  const lastThreeFingerTapRef = useRef<{
    centerX: number;
    centerY: number;
    time: number;
  } | null>(null);
  const lastPencilToolbarTapRef = useRef<number>(0);
  const zoomScaleRef = useRef<number>(1);
  const zoomOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const effectiveInk = useMemo(() => {
    if (activeTool === "eraser") {
      return {
        lineWidth: clampStrokeSize(strokeSize),
        opacity: 1,
      };
    }

    if (activeTool === "highlighter") {
      return {
        lineWidth: clampStrokeSize(strokeSize) * 2.3,
        opacity: 0.28,
      };
    }

    if (activeTool === "pencil") {
      return {
        lineWidth: clampStrokeSize(strokeSize) * 0.9,
        opacity: 0.75,
      };
    }

    return {
      lineWidth: clampStrokeSize(strokeSize),
      opacity: 1,
    };
  }, [activeTool, strokeSize]);

  const eraseRadius = useMemo(() => {
    return Math.max(10, clampStrokeSize(strokeSize) * 6);
  }, [strokeSize]);

  const canSaveStyle = isDrawingTool(activeTool);

  useEffect(() => {
    try {
      localStorage.setItem(
        FAVORITE_COLORS_STORAGE_KEY,
        JSON.stringify(favoriteColors),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [favoriteColors]);

  useEffect(() => {
    try {
      localStorage.setItem(
        FAVORITE_STYLES_STORAGE_KEY,
        JSON.stringify(favoriteStyles),
      );
    } catch {
      // Ignore storage write failures.
    }
  }, [favoriteStyles]);

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

  useEffect(() => {
    zoomScaleRef.current = zoomScale;
  }, [zoomScale]);

  useEffect(() => {
    zoomOffsetRef.current = zoomOffset;
  }, [zoomOffset]);

  useEffect(() => {
    // Keep the app fixed in-place on iPad while preserving pinch zoom.
    const preventSingleFingerPan = (event: TouchEvent) => {
      if (zoomScaleRef.current > MIN_ZOOM_SCALE + 0.001) {
        return;
      }

      if (event.touches.length !== 1) {
        return;
      }

      const stage = plannerStageRef.current;
      const target = event.target;
      if (!stage || !(target instanceof HTMLElement) || !stage.contains(target)) {
        return;
      }

      const startedOnInteractiveControl =
        target.closest("a, button, input, select, label, textarea, [role='button']") !==
        null;
      if (startedOnInteractiveControl) {
        return;
      }

      event.preventDefault();
    };

    document.addEventListener("touchmove", preventSingleFingerPan, {
      passive: false,
    });
    return () => {
      document.removeEventListener("touchmove", preventSingleFingerPan);
    };
  }, []);

  useEffect(() => {
    const stage = plannerStageRef.current;
    if (!stage) {
      return;
    }

    const preventSelectStart = (event: Event) => {
      event.preventDefault();
    };

    stage.addEventListener("selectstart", preventSelectStart);
    return () => {
      stage.removeEventListener("selectstart", preventSelectStart);
    };
  }, []);

  const handleMonthTabChange = (nextMonth: number) => {
    setYear((currentYear) => {
      if (nextMonth === 1 && month === 12) return currentYear + 1;
      if (nextMonth === 12 && month === 1) return currentYear - 1;
      return currentYear;
    });
    setMonth(nextMonth);
    setWeekIndex(0);
  };

  const handleWeekTabChange = (nextWeekIndex: number) => {
    setWeekIndex(nextWeekIndex);
  };

  const setTool = (tool: InkTool) => {
    setActiveTool(tool);
    if (
      tool === "eraser" ||
      tool === "bucket" ||
      tool === "lasso" ||
      tool === "shape" ||
      tool === "image" ||
      tool === "sticky"
    ) {
      setActiveSymbol("");
    }
  };

  const handleStickyNoteCreated = useCallback(() => {
    setActiveTool(lastDrawingToolRef.current);
  }, []);

  const toggleEraserFromPencilDoubleTap = useCallback(() => {
    setActiveTool((currentTool) => {
      if (currentTool === "eraser") {
        return lastNonEraserToolRef.current === "eraser"
          ? "pen"
          : lastNonEraserToolRef.current;
      }

      lastNonEraserToolRef.current = currentTool;
      return "eraser";
    });
    setActiveSymbol("");
  }, []);

  const switchToPreviousTool = useCallback(() => {
    setActiveTool(lastNonEraserToolRef.current === "eraser" ? "pen" : lastNonEraserToolRef.current);
    setActiveSymbol("");
  }, []);

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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const applePencilPlugin = registerPlugin<ApplePencilPlugin>("ApplePencil");
    let canceled = false;
    const listenerHandles: PluginListenerHandle[] = [];

    const registerApplePencilListeners = async () => {
      // Register listeners first — do NOT gate on getCapabilities().
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

      // Read capabilities separately — failure here does not break listeners.
      try {
        const caps = await applePencilPlugin.getCapabilities();
        if (!canceled && caps.preferredTapAction) {
          preferredPencilActionRef.current = caps.preferredTapAction;
        }
      } catch {
        // Capabilities unavailable — keep default "switchEraser" behavior.
      }
    };

    void registerApplePencilListeners();

    return () => {
      canceled = true;
      for (const handle of listenerHandles) {
        handle.remove().catch(() => {
          // Ignore listener cleanup failures during unmount.
        });
      }
    };
  }, [handlePencilAction]);

  const getActiveInkPageId = () => {
    const plannerWindow = window as Window & { __plannerActiveInkPageId?: string };
    const candidate = plannerWindow[ACTIVE_INK_PAGE_KEY];
    if (typeof candidate === "string") {
      const activeMatch = document.querySelector<HTMLElement>(
        `.planner-spread.is-active .ink-layer-root[data-ink-page-id="${candidate}"]`,
      );
      if (activeMatch) {
        return candidate;
      }
    }

    const activeInkLayer = document.querySelector<HTMLElement>(
      ".planner-spread.is-active .ink-layer-root[data-ink-page-id]",
    );
    const fallbackPageId = activeInkLayer?.dataset.inkPageId;
    if (typeof fallbackPageId === "string" && fallbackPageId.length > 0) {
      return fallbackPageId;
    }

    return null;
  };

  const dispatchHistoryEvent = (eventName: string) => {
    window.dispatchEvent(
      new CustomEvent<PlannerHistoryEventDetail>(eventName, {
        detail: {
          targetPageId: getActiveInkPageId(),
        },
      }),
    );
  };

  const triggerUndo = () => {
    dispatchHistoryEvent(PLANNER_UNDO_EVENT);
  };

  const triggerRedo = () => {
    dispatchHistoryEvent(PLANNER_REDO_EVENT);
  };

  const handleStylusUiPointerDownCapture = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!isLikelyStylusPointerEvent(event)) {
        return;
      }

      const interactiveElement = getClosestInteractiveControl(event.target);
      if (!interactiveElement) {
        return;
      }

      const disableAwareElement = interactiveElement as HTMLElement & {
        disabled?: boolean;
      };
      if (disableAwareElement.disabled === true) {
        return;
      }

      if (interactiveElement instanceof HTMLInputElement) {
        const inputType = interactiveElement.type;
        if (inputType === "range") {
          interactiveElement.focus();
          return;
        }
        if (inputType === "text" || inputType === "search" || inputType === "color") {
          event.preventDefault();
          interactiveElement.focus();
          interactiveElement.click();
          return;
        }
        if (inputType === "checkbox" || inputType === "radio") {
          event.preventDefault();
          interactiveElement.click();
          return;
        }
      }

      if (
        interactiveElement instanceof HTMLTextAreaElement ||
        interactiveElement instanceof HTMLSelectElement
      ) {
        event.preventDefault();
        interactiveElement.focus();
        interactiveElement.click();
        return;
      }

      if (interactiveElement instanceof HTMLLabelElement) {
        const labeledInput = interactiveElement.control as
          | (HTMLElement & { disabled?: boolean; focus: () => void; click: () => void })
          | null;
        if (labeledInput && labeledInput.disabled !== true) {
          event.preventDefault();
          labeledInput.focus();
          labeledInput.click();
        }
        return;
      }

      if (interactiveElement instanceof HTMLButtonElement) {
        event.preventDefault();
        interactiveElement.focus();
        interactiveElement.click();
        return;
      }

      if (interactiveElement instanceof HTMLAnchorElement) {
        event.preventDefault();
        interactiveElement.focus();
        interactiveElement.click();
      }
    },
    [],
  );

  const clampZoomOffset = (
    candidate: { x: number; y: number },
    scale: number,
  ) => {
    const surface = zoomSurfaceRef.current;
    if (!surface || scale <= MIN_ZOOM_SCALE + 0.001) {
      return { x: 0, y: 0 };
    }

    const maxX = Math.max(0, ((surface.offsetWidth || 0) * (scale - 1)) / 2);
    const maxY = Math.max(0, ((surface.offsetHeight || 0) * (scale - 1)) / 2);

    return {
      x: clampValue(candidate.x, -maxX, maxX),
      y: clampValue(candidate.y, -maxY, maxY),
    };
  };

  const applyZoomTransform = (
    scaleValue: number,
    offsetValue: { x: number; y: number },
  ) => {
    const clampedScale = clampValue(scaleValue, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE);
    const clampedOffset = clampZoomOffset(offsetValue, clampedScale);
    zoomScaleRef.current = clampedScale;
    zoomOffsetRef.current = clampedOffset;
    setZoomScale(clampedScale);
    setZoomOffset(clampedOffset);
  };

  const beginPinchGesture = () => {
    const surface = zoomSurfaceRef.current;
    if (!surface || activeTouchPointsRef.current.size < 2) {
      pinchGestureRef.current = null;
      return;
    }

    const [firstPoint, secondPoint] = Array.from(
      activeTouchPointsRef.current.values(),
    ).slice(0, 2);
    const distance = Math.hypot(
      secondPoint.x - firstPoint.x,
      secondPoint.y - firstPoint.y,
    );
    if (distance < 2) {
      pinchGestureRef.current = null;
      return;
    }

    const centerX = (firstPoint.x + secondPoint.x) / 2;
    const centerY = (firstPoint.y + secondPoint.y) / 2;
    const rect = surface.getBoundingClientRect();
    const currentScale = zoomScaleRef.current;

    pinchGestureRef.current = {
      startDistance: distance,
      startScale: currentScale,
      startTranslateX: zoomOffsetRef.current.x,
      startTranslateY: zoomOffsetRef.current.y,
      startRectLeft: rect.left,
      startRectTop: rect.top,
      contentX: (centerX - rect.left) / currentScale,
      contentY: (centerY - rect.top) / currentScale,
    };
  };

  const syncActiveStageTouchCount = useCallback(() => {
    const nextCount = activeTouchPointsRef.current.size;
    (window as Window & { __plannerActiveStageTouchCount?: number })[
      ACTIVE_STAGE_TOUCH_COUNT_KEY
    ] = nextCount;
    setActiveStageTouchCount((currentCount) =>
      currentCount === nextCount ? currentCount : nextCount,
    );
  }, []);

  const clearBrowserSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      selection.removeAllRanges();
    }
  }, []);

  useEffect(() => {
    const plannerContainsNode = (node: Node | null): boolean => {
      const stage = plannerStageRef.current;
      if (!stage || !node) {
        return false;
      }
      if (node instanceof Element) {
        return stage.contains(node);
      }
      return stage.contains(node.parentElement);
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const anchorInPlanner = plannerContainsNode(selection.anchorNode);
      const focusInPlanner = plannerContainsNode(selection.focusNode);
      if (!anchorInPlanner && !focusInPlanner) {
        return;
      }

      selection.removeAllRanges();
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, []);

  const resetStageTouchState = useCallback(() => {
    activeTouchPointsRef.current.clear();
    touchGestureMetaRef.current.clear();
    pinchGestureRef.current = null;
    activeThreeFingerTapRef.current = null;
    (window as Window & { __plannerActiveStageTouchCount?: number })[
      ACTIVE_STAGE_TOUCH_COUNT_KEY
    ] = 0;
    setActiveStageTouchCount(0);
  }, []);

  useEffect(() => {
    const handleInterrupt = () => {
      resetStageTouchState();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        resetStageTouchState();
      }
    };

    window.addEventListener("hashchange", handleInterrupt);
    window.addEventListener("blur", handleInterrupt);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("hashchange", handleInterrupt);
      window.removeEventListener("blur", handleInterrupt);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resetStageTouchState]);

  // Track whether a stylus (Apple Pencil) is currently in contact so we can
  // suppress palm-touch events that slip through during zoomed-in writing.
  useEffect(() => {
    const handleStylusDown = (event: PointerEvent) => {
      if (event.pointerType === "pen") {
        activeStylusPointerRef.current = true;
        // Stamp the window with the last pen-contact time so MonthlyView swipe
        // handlers can block palm-triggered navigation while writing.
        (window as Window & { __plannerLastPenMs?: number }).__plannerLastPenMs = Date.now();
      }
    };
    const handleStylusUp = (event: PointerEvent) => {
      if (event.pointerType === "pen") {
        activeStylusPointerRef.current = false;
        // Also clear any stale touch points that snuck in during stylus contact.
        activeTouchPointsRef.current.clear();
        touchGestureMetaRef.current.clear();
        pinchGestureRef.current = null;
        activeThreeFingerTapRef.current = null;
        syncActiveStageTouchCount();
      }
    };
    window.addEventListener("pointerdown", handleStylusDown, true);
    window.addEventListener("pointerup", handleStylusUp, true);
    window.addEventListener("pointercancel", handleStylusUp, true);
    return () => {
      window.removeEventListener("pointerdown", handleStylusDown, true);
      window.removeEventListener("pointerup", handleStylusUp, true);
      window.removeEventListener("pointercancel", handleStylusUp, true);
    };
  }, [syncActiveStageTouchCount]);

  useEffect(() => {
    const releaseTrackedTouchPointer = (pointerId: number) => {
      const hadTrackedPointer = activeTouchPointsRef.current.delete(pointerId);
      touchGestureMetaRef.current.delete(pointerId);
      if (!hadTrackedPointer) {
        return;
      }

      if (activeTouchPointsRef.current.size === 0) {
        touchGestureMetaRef.current.clear();
        pinchGestureRef.current = null;
        activeThreeFingerTapRef.current = null;
      } else if (activeTouchPointsRef.current.size < 2) {
        pinchGestureRef.current = null;
      }

      syncActiveStageTouchCount();
    };

    const handleGlobalTouchPointerEnd = (event: PointerEvent) => {
      if (event.pointerType !== "touch") {
        return;
      }
      releaseTrackedTouchPointer(event.pointerId);
    };

    window.addEventListener("pointerup", handleGlobalTouchPointerEnd, true);
    window.addEventListener("pointercancel", handleGlobalTouchPointerEnd, true);

    return () => {
      window.removeEventListener("pointerup", handleGlobalTouchPointerEnd, true);
      window.removeEventListener("pointercancel", handleGlobalTouchPointerEnd, true);
    };
  }, [syncActiveStageTouchCount]);

  const handleStagePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const isStylusInput = isLikelyStylusPointerEvent(event);
    if (isStylusInput) {
      clearBrowserSelection();
      return;
    }

    if (event.pointerType !== "touch") {
      return;
    }

    // Palm rejection: if an Apple Pencil is currently drawing, ignore all
    // finger/palm touches so they don't interfere with ink strokes.
    if (activeStylusPointerRef.current) {
      return;
    }

    if (shouldSkipStageTouchTracking(event.target)) {
      resetStageTouchState();
      return;
    }

    activeTouchPointsRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    touchGestureMetaRef.current.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      startTime: Date.now(),
    });
    syncActiveStageTouchCount();

    // Suppress iOS text/callout interactions on planner paper while preserving
    // explicit interactive controls (handled by shouldSkipStageTouchTracking).
    event.preventDefault();
    clearBrowserSelection();

    if (activeTouchPointsRef.current.size === 3) {
      const points = Array.from(activeTouchPointsRef.current.entries());
      const pointerIds = points.map(([pointerId]) => pointerId);
      const gestureTimes = pointerIds
        .map((pointerId) => touchGestureMetaRef.current.get(pointerId)?.startTime ?? Date.now());
      const earliest = Math.min(...gestureTimes);
      const latest = Math.max(...gestureTimes);

      if (latest - earliest <= 120) {
        const centerX =
          points.reduce((sum, [, point]) => sum + point.x, 0) / points.length;
        const centerY =
          points.reduce((sum, [, point]) => sum + point.y, 0) / points.length;
        activeThreeFingerTapRef.current = {
          pointerIds,
          startTime: earliest,
          centerX,
          centerY,
          maxMove: 0,
        };
      } else {
        activeThreeFingerTapRef.current = null;
      }
    } else if (activeTouchPointsRef.current.size > 3) {
      activeThreeFingerTapRef.current = null;
    }

    if (activeTouchPointsRef.current.size === 2) {
      beginPinchGesture();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (activeTouchPointsRef.current.size >= 3) {
      pinchGestureRef.current = null;
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleStagePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const isStylusInput = isLikelyStylusPointerEvent(event);
    if (isStylusInput) {
      clearBrowserSelection();
      return;
    }

    if (
      event.pointerType !== "touch" ||
      !activeTouchPointsRef.current.has(event.pointerId)
    ) {
      return;
    }

    activeTouchPointsRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const gestureMeta = touchGestureMetaRef.current.get(event.pointerId);
    if (gestureMeta) {
      gestureMeta.currentX = event.clientX;
      gestureMeta.currentY = event.clientY;
    }

    // Keep system selection/callout UI from interrupting in-progress writing.
    event.preventDefault();
    clearBrowserSelection();

    const threeFingerTap = activeThreeFingerTapRef.current;
    if (threeFingerTap) {
      let maxMove = threeFingerTap.maxMove;
      for (const pointerId of threeFingerTap.pointerIds) {
        const pointerMeta = touchGestureMetaRef.current.get(pointerId);
        if (!pointerMeta) {
          continue;
        }

        const movement = Math.hypot(
          pointerMeta.currentX - pointerMeta.startX,
          pointerMeta.currentY - pointerMeta.startY,
        );
        maxMove = Math.max(maxMove, movement);
      }
      threeFingerTap.maxMove = maxMove;
    }

    if (activeTouchPointsRef.current.size < 2) {
      return;
    }

    if (activeTouchPointsRef.current.size > 2) {
      pinchGestureRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!pinchGestureRef.current) {
      beginPinchGesture();
    }
    const pinch = pinchGestureRef.current;
    if (!pinch) {
      return;
    }

    const [firstPoint, secondPoint] = Array.from(
      activeTouchPointsRef.current.values(),
    ).slice(0, 2);
    const currentDistance = Math.hypot(
      secondPoint.x - firstPoint.x,
      secondPoint.y - firstPoint.y,
    );
    const centerX = (firstPoint.x + secondPoint.x) / 2;
    const centerY = (firstPoint.y + secondPoint.y) / 2;

    const nextScale = clampValue(
      pinch.startScale * (currentDistance / pinch.startDistance),
      MIN_ZOOM_SCALE,
      MAX_ZOOM_SCALE,
    );

    if (nextScale <= MIN_ZOOM_SCALE + 0.001) {
      applyZoomTransform(1, { x: 0, y: 0 });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const nextRectLeft = centerX - pinch.contentX * nextScale;
    const nextRectTop = centerY - pinch.contentY * nextScale;
    const nextOffset = {
      x: pinch.startTranslateX + (nextRectLeft - pinch.startRectLeft),
      y: pinch.startTranslateY + (nextRectTop - pinch.startRectTop),
    };

    applyZoomTransform(nextScale, nextOffset);
    event.preventDefault();
    event.stopPropagation();
  };

  const clearStageTouch = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isStylusInput = isLikelyStylusPointerEvent(event);
    if (isStylusInput) {
      clearBrowserSelection();
      return;
    }

    if (event.pointerType !== "touch") {
      return;
    }

    const hadTrackedTouch = activeTouchPointsRef.current.has(event.pointerId);
    if (hadTrackedTouch) {
      event.preventDefault();
      clearBrowserSelection();
    }

    const touchMeta = touchGestureMetaRef.current.get(event.pointerId);
    if (touchMeta) {
      touchMeta.currentX = event.clientX;
      touchMeta.currentY = event.clientY;
    }

    const hadPinch = pinchGestureRef.current !== null;
    const threeFingerTap = activeThreeFingerTapRef.current;
    const releasedFromThreeFingerTap =
      threeFingerTap?.pointerIds.includes(event.pointerId) ?? false;

    activeTouchPointsRef.current.delete(event.pointerId);
    touchGestureMetaRef.current.delete(event.pointerId);
    if (activeTouchPointsRef.current.size === 0) {
      touchGestureMetaRef.current.clear();
    }
    syncActiveStageTouchCount();
    if (activeTouchPointsRef.current.size < 2) {
      pinchGestureRef.current = null;
    }

    if (
      threeFingerTap &&
      releasedFromThreeFingerTap &&
      activeTouchPointsRef.current.size === 0
    ) {
      const now = Date.now();
      const duration = now - threeFingerTap.startTime;
      const isTapGesture =
        duration <= THREE_FINGER_TAP_MAX_MS &&
        threeFingerTap.maxMove <= THREE_FINGER_MAX_MOVE;

      if (isTapGesture) {
        const previousTap = lastThreeFingerTapRef.current;
        if (previousTap) {
          const tapGap = now - previousTap.time;
          const tapDistance = Math.hypot(
            threeFingerTap.centerX - previousTap.centerX,
            threeFingerTap.centerY - previousTap.centerY,
          );
          if (tapGap <= THREE_FINGER_DOUBLE_TAP_MS && tapDistance <= 72) {
            lastThreeFingerTapRef.current = null;
            triggerUndo();
          } else {
            lastThreeFingerTapRef.current = {
              centerX: threeFingerTap.centerX,
              centerY: threeFingerTap.centerY,
              time: now,
            };
          }
        } else {
          lastThreeFingerTapRef.current = {
            centerX: threeFingerTap.centerX,
            centerY: threeFingerTap.centerY,
            time: now,
          };
        }
      }

      activeThreeFingerTapRef.current = null;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (activeTouchPointsRef.current.size === 0) {
      activeThreeFingerTapRef.current = null;
    }

    if (hadPinch || releasedFromThreeFingerTap) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleToolButtonClick = (tool: InkTool, tapTime: number) => {
    if (tool !== "pencil") {
      lastPencilToolbarTapRef.current = 0;
      setTool(tool);
      return;
    }

    if (
      activeTool === "pencil" &&
      tapTime - lastPencilToolbarTapRef.current <= PENCIL_DOUBLE_TAP_MS
    ) {
      lastPencilToolbarTapRef.current = 0;
      toggleEraserFromPencilDoubleTap();
      return;
    }

    lastPencilToolbarTapRef.current = tapTime;
    setTool("pencil");
  };

  const saveCurrentColor = () => {
    const normalized = activeColor.toLowerCase();
    if (!isHexColor(normalized)) {
      return;
    }

    setFavoriteColors((current) => {
      if (current.includes(normalized)) {
        return current;
      }
      return [normalized, ...current].slice(0, FAVORITE_COLOR_LIMIT);
    });
  };

  const saveCurrentStyle = () => {
    if (!isDrawingTool(activeTool)) {
      return;
    }

    const normalizedColor = activeColor.toLowerCase();
    const normalizedSize = clampStrokeSize(strokeSize);
    const normalizedTip = normalizeInkTip(activeTip);

    setFavoriteStyles((current) => {
      const exists = current.some(
        (preset) =>
          preset.tool === activeTool &&
          preset.color === normalizedColor &&
          Math.abs(preset.size - normalizedSize) < 0.001 &&
          preset.tip === normalizedTip,
      );

      if (exists) {
        return current;
      }

      return [
        makeFavoriteStyle(
          activeTool,
          normalizedColor,
          normalizedSize,
          normalizedTip,
        ),
        ...current,
      ].slice(0, FAVORITE_STYLE_LIMIT);
    });
  };

  const applyStyle = (preset: FavoriteStyle) => {
    setActiveTool(preset.tool);
    setActiveColor(preset.color);
    setStrokeSize(preset.size);
    setActiveTip(normalizeInkTip(preset.tip));
    setActiveSymbol("");
  };

  const handleDeleteStyle = useCallback((id: string) => {
    setFavoriteStyles((current) => current.filter((s) => s.id !== id));
  }, []);

  const handleZoomIn = useCallback(() => {
    applyZoomTransform(
      clampValue(zoomScaleRef.current + 0.2, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE),
      zoomOffsetRef.current,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleZoomOut = useCallback(() => {
    applyZoomTransform(
      clampValue(zoomScaleRef.current - 0.2, MIN_ZOOM_SCALE, MAX_ZOOM_SCALE),
      zoomOffsetRef.current,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : null;
      if (!src) {
        return;
      }

      setImageStampSrc(src);
      setActiveTool("image");
    };
    reader.readAsDataURL(file);
  };

  const activeInkMode:
    | "draw"
    | "erase"
    | "bucket"
    | "shape"
    | "lasso"
    | "image"
    | "sticky" = (() => {
    if (activeTool === "eraser") {
      return "erase";
    }
    if (activeTool === "shape") {
      return "shape";
    }
    if (activeTool === "bucket") {
      return "bucket";
    }
    if (activeTool === "lasso") {
      return "lasso";
    }
    if (activeTool === "image") {
      return "image";
    }
    if (activeTool === "sticky") {
      return "sticky";
    }
    return "draw";
  })();

  const activeInkSymbol =
    activeTool === "elements"
      ? activeSymbol || null
      : activeTool === "text"
        ? textStamp.trim() || "note"
        : null;

  return (
    <main className="app-shell" onPointerDownCapture={handleStylusUiPointerDownCapture}>
      <FloatingToolbar
        activeTool={activeTool}
        activeColor={activeColor}
        strokeSize={strokeSize}
        activeTip={activeTip}
        activeSymbol={activeSymbol}
        shapeKind={shapeKind}
        textStamp={textStamp}
        allowTouchInk={allowTouchInk}
        imageStampSrc={imageStampSrc}
        favoriteColors={favoriteColors}
        favoriteStyles={favoriteStyles}
        canSaveStyle={canSaveStyle}
        onToolChange={handleToolButtonClick}
        onColorChange={setActiveColor}
        onSizeChange={setStrokeSize}
        onTipChange={setActiveTip}
        onSymbolChange={setActiveSymbol}
        onShapeKindChange={setShapeKind}
        onTextStampChange={setTextStamp}
        onTouchInkChange={setAllowTouchInk}
        onSaveColor={saveCurrentColor}
        onSaveStyle={saveCurrentStyle}
        onApplyStyle={applyStyle}
        onDeleteStyle={handleDeleteStyle}
        onUndo={triggerUndo}
        onRedo={triggerRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onImageFileChange={handleImageFileChange}
      />

      <div className="app-layout">
        <div
          ref={plannerStageRef}
          className="planner-stage"
          onContextMenu={(event) => {
            event.preventDefault();
          }}
          onDragStartCapture={(event) => {
            if (shouldSkipStageTouchTracking(event.target)) {
              return;
            }
            event.preventDefault();
          }}
          onPointerDownCapture={handleStagePointerDown}
          onPointerMoveCapture={handleStagePointerMove}
          onPointerUpCapture={clearStageTouch}
          onPointerCancelCapture={clearStageTouch}
        >
          <div
            ref={zoomSurfaceRef}
            className="planner-zoom-surface"
            style={{
              transform: `translate3d(${zoomOffset.x}px, ${zoomOffset.y}px, 0) scale(${zoomScale})`,
            }}
          >
            <MonthlyView
              year={year}
              month={month}
              weekIndex={weekIndex}
              allowTouchInk={allowTouchInk}
              inkColor={activeColor}
              inkLineWidth={effectiveInk.lineWidth}
              inkOpacity={effectiveInk.opacity}
              inkSymbol={activeInkSymbol}
              inkTipKind={activeTip}
              inkMode={activeInkMode}
              inkShapeKind={shapeKind}
              inkImageSrc={activeTool === "image" ? imageStampSrc : null}
              inkEraseRadius={eraseRadius}
              activeTouchCount={activeStageTouchCount}
              onMonthChange={handleMonthTabChange}
              onWeekIndexChange={handleWeekTabChange}
              onStickyNoteCreated={handleStickyNoteCreated}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
