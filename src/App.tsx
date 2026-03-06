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

const DEFAULT_YEAR = 2026;
const DEFAULT_MONTH = 3;
const DEFAULT_WEEK_INDEX = 2;
const DEFAULT_COLOR = "#2f2b2a";
const DEFAULT_STROKE_SIZE = 2.1;
const FAVORITE_COLOR_LIMIT = 12;
const FAVORITE_STYLE_LIMIT = 8;
const FAVORITE_COLORS_STORAGE_KEY = "planner-favorite-colors-v1";
const FAVORITE_STYLES_STORAGE_KEY = "planner-favorite-styles-v1";
const DEFAULT_COLOR_PALETTE = [
  "#2f2b2a",
  "#1f3a64",
  "#0f6f67",
  "#0f8f43",
  "#a05f13",
  "#8d2525",
  "#7f3c9a",
  "#5f5f63",
];
const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 2.8;
const PENCIL_DOUBLE_TAP_MS = 340;
const THREE_FINGER_TAP_MAX_MS = 340;
const THREE_FINGER_DOUBLE_TAP_MS = 520;
const THREE_FINGER_MAX_MOVE = 26;
const PLANNER_UNDO_EVENT = "planner-undo";
const PLANNER_REDO_EVENT = "planner-redo";
const ACTIVE_INK_PAGE_KEY = "__plannerActiveInkPageId";

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

type ShapeKind = "line" | "rectangle" | "ellipse" | "triangle";
type DrawingTool = "pen" | "pencil" | "highlighter" | "shape";
type InkTipKind = "round" | "fine" | "fountain" | "marker" | "chisel";
type InkTool =
  | DrawingTool
  | "eraser"
  | "bucket"
  | "lasso"
  | "elements"
  | "text"
  | "image"
  | "sticky";

interface FavoriteStyle {
  id: string;
  tool: DrawingTool;
  color: string;
  size: number;
  tip: InkTipKind;
}

interface SymbolOption {
  label: string;
  value: string;
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

const TOOL_LABELS: Record<InkTool, string> = {
  pen: "Pen",
  pencil: "Pencil",
  highlighter: "Highlighter",
  eraser: "Eraser",
  bucket: "Bucket",
  shape: "Shape",
  lasso: "Lasso",
  elements: "Elements",
  text: "Text",
  image: "Image",
  sticky: "Post-it",
};

const TOOL_SEQUENCE: InkTool[] = [
  "pen",
  "pencil",
  "highlighter",
  "bucket",
  "eraser",
  "shape",
  "lasso",
  "elements",
  "text",
  "image",
  "sticky",
];

const SHAPE_OPTIONS: Array<{ label: string; value: ShapeKind }> = [
  { label: "Line", value: "line" },
  { label: "Rect", value: "rectangle" },
  { label: "Oval", value: "ellipse" },
  { label: "Tri", value: "triangle" },
];

const SYMBOL_OPTIONS: SymbolOption[] = [
  { label: "Draw", value: "" },
  { label: "Check", value: "✓" },
  { label: "Star", value: "★" },
  { label: "Bullet", value: "•" },
  { label: "Arrow", value: "→" },
  { label: "Heart", value: "♥" },
];

const TIP_OPTIONS: Array<{ value: InkTipKind; label: string }> = [
  { value: "round", label: "Round" },
  { value: "fine", label: "Fine" },
  { value: "fountain", label: "Fountain" },
  { value: "marker", label: "Marker" },
  { value: "chisel", label: "Chisel" },
];

function normalizeInkTip(value: unknown): InkTipKind {
  if (value === "round") {
    return "round";
  }
  if (value === "fine") {
    return "fine";
  }
  if (value === "fountain") {
    return "fountain";
  }
  if (value === "marker") {
    return "marker";
  }
  if (value === "chisel") {
    return "chisel";
  }
  return "round";
}

function ToolIcon({ tool }: { tool: InkTool }) {
  if (tool === "pen") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <path d="M5 19l4-1 8-8-3-3-8 8-1 4z" />
        <path d="M13 6l3 3" />
      </svg>
    );
  }

  if (tool === "pencil") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <path d="M4 17l3 3 11-11-3-3L4 17z" />
        <path d="M3 21l4-1-3-3-1 4z" />
      </svg>
    );
  }

  if (tool === "highlighter") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <path d="M6 7h8l3 3v7H6z" />
        <path d="M6 14h11" />
      </svg>
    );
  }

  if (tool === "eraser") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <path d="M6 15l6-8 7 5-6 8H6z" />
        <path d="M4 19h16" />
      </svg>
    );
  }

  if (tool === "bucket") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <path d="M6 11l6-6 6 6-6 6-6-6z" />
        <path d="M4 18h16" />
      </svg>
    );
  }

  if (tool === "shape") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <rect x="3.5" y="4.5" width="8" height="8" rx="1" />
        <circle cx="16.5" cy="16.5" r="4" />
      </svg>
    );
  }

  if (tool === "lasso") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <path d="M5 9c0-3 3-5 7-5s7 2 7 5-3 5-7 5-7-2-7-5z" />
        <path d="M12 14v4c0 1-1 2-2 2" />
      </svg>
    );
  }

  if (tool === "elements") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <path
          d="M12 4l2.2 4.7 5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1-3.7-3.6 5.1-.7z"
          fill="currentColor"
          stroke="none"
        />
      </svg>
    );
  }

  if (tool === "text") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <path d="M4 6h16" />
        <path d="M12 6v13" />
        <path d="M8 19h8" />
      </svg>
    );
  }

  if (tool === "sticky") {
    return (
      <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
        <rect x="4" y="4" width="15" height="15" rx="1.8" />
        <path d="M13 19v-4.5c0-.9.7-1.5 1.5-1.5H19" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M6 16l4-4 3 3 3-5 2 6" />
      <circle cx="8" cy="9" r="1.4" />
    </svg>
  );
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

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function clampStrokeSize(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_STROKE_SIZE;
  }
  return Math.min(Math.max(value, 0.8), 4.8);
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

  if (event.pointerType !== "touch") {
    return false;
  }

  if ((Math.abs(event.tiltX) > 0 || Math.abs(event.tiltY) > 0) && event.pressure > 0) {
    return true;
  }

  if (
    event.width > 0 &&
    event.height > 0 &&
    event.width <= 8 &&
    event.height <= 8 &&
    event.pressure > 0
  ) {
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

function isDrawingTool(tool: InkTool): tool is DrawingTool {
  return (
    tool === "pen" ||
    tool === "pencil" ||
    tool === "highlighter" ||
    tool === "shape"
  );
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
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [weekIndex, setWeekIndex] = useState<number>(DEFAULT_WEEK_INDEX);
  const [allowTouchInk, setAllowTouchInk] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<InkTool>("pen");
  const [activeColor, setActiveColor] = useState<string>(DEFAULT_COLOR);
  const [strokeSize, setStrokeSize] = useState<number>(DEFAULT_STROKE_SIZE);
  const [activeTip, setActiveTip] = useState<InkTipKind>("round");
  const [activeSymbol, setActiveSymbol] = useState<string>("");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("line");
  const [textStamp, setTextStamp] = useState<string>("note");
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [zoomOffset, setZoomOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [imageStampSrc, setImageStampSrc] = useState<string | null>(null);
  const [favoriteColors, setFavoriteColors] = useState<string[]>(
    loadFavoriteColors,
  );
  const [favoriteStyles, setFavoriteStyles] = useState<FavoriteStyle[]>(
    loadFavoriteStyles,
  );
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const plannerStageRef = useRef<HTMLDivElement | null>(null);
  const zoomSurfaceRef = useRef<HTMLDivElement | null>(null);
  const lastNonEraserToolRef = useRef<InkTool>("pen");
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

  const visibleColorSwatches = useMemo(() => {
    const merged = [...favoriteColors];
    for (const color of DEFAULT_COLOR_PALETTE) {
      if (!merged.includes(color)) {
        merged.push(color);
      }
    }
    return merged.slice(0, FAVORITE_COLOR_LIMIT);
  }, [favoriteColors]);

  const canSaveStyle = isDrawingTool(activeTool);
  const isStrokeEnabled =
    activeTool !== "bucket" &&
    activeTool !== "lasso" &&
    activeTool !== "elements" &&
    activeTool !== "text" &&
    activeTool !== "image" &&
    activeTool !== "sticky";
  const isPaletteEnabled =
    activeTool !== "eraser" &&
    activeTool !== "lasso" &&
    activeTool !== "image";
  const showShapeControls = activeTool === "shape";
  const showElementControls = activeTool === "elements";
  const showTextControls = activeTool === "text";
  const showImageControls = activeTool === "image";
  const canSelectTip = isDrawingTool(activeTool);

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

  const handleMonthTabChange = (nextMonth: number) => {
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

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const applePencilPlugin = registerPlugin<ApplePencilPlugin>("ApplePencil");
    let canceled = false;
    const listenerHandles: PluginListenerHandle[] = [];

    const registerApplePencilListeners = async () => {
      try {
        await applePencilPlugin.getCapabilities();

        if (canceled) {
          return;
        }

        const tapHandle = await applePencilPlugin.addListener(
          "pencilTap",
          () => {
            toggleEraserFromPencilDoubleTap();
          },
        );
        listenerHandles.push(tapHandle);

        const squeezeHandle = await applePencilPlugin.addListener(
          "pencilSqueeze",
          (event) => {
            if (event.phase === "changed" || event.phase === "began") {
              return;
            }
            toggleEraserFromPencilDoubleTap();
          },
        );
        listenerHandles.push(squeezeHandle);
      } catch {
        // Native Apple Pencil bridge is unavailable on web and older runtimes.
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
  }, [toggleEraserFromPencilDoubleTap]);

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
        interactiveElement.focus();
        return;
      }

      if (interactiveElement instanceof HTMLAnchorElement) {
        interactiveElement.focus();
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

  const resetStageTouchState = useCallback(() => {
    activeTouchPointsRef.current.clear();
    touchGestureMetaRef.current.clear();
    pinchGestureRef.current = null;
    activeThreeFingerTapRef.current = null;
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

  const handleStagePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.pointerType !== "touch" || isLikelyStylusPointerEvent(event)) {
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
    if (
      event.pointerType !== "touch" ||
      isLikelyStylusPointerEvent(event) ||
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
    if (event.pointerType !== "touch" || isLikelyStylusPointerEvent(event)) {
      return;
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
      <header className="top-ink-toolbar" aria-label="Writing tools">
        <div className="top-toolbar-row">
          <div className="top-toolbar-group">
            {TOOL_SEQUENCE.map((tool) => (
              <button
                key={tool}
                type="button"
                className={
                  tool === activeTool
                    ? "toolbar-button toolbar-icon-button active"
                    : "toolbar-button toolbar-icon-button"
                }
                onClick={(event) => {
                  handleToolButtonClick(tool, event.timeStamp);
                }}
                title={TOOL_LABELS[tool]}
                aria-label={TOOL_LABELS[tool]}
              >
                <ToolIcon tool={tool} />
                <span className="sr-only">{TOOL_LABELS[tool]}</span>
              </button>
            ))}
            <button
              type="button"
              className="toolbar-button toolbar-icon-button"
              onClick={triggerUndo}
              title="Undo (three-finger double tap)"
              aria-label="Undo"
            >
              <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
                <path d="M9 7L4 12l5 5" />
                <path d="M5 12h9a6 6 0 010 12h-1" />
              </svg>
            </button>
            <button
              type="button"
              className="toolbar-button toolbar-icon-button"
              onClick={triggerRedo}
              title="Redo"
              aria-label="Redo"
            >
              <svg viewBox="0 0 24 24" className="tool-icon-svg" aria-hidden="true">
                <path d="M15 7l5 5-5 5" />
                <path d="M19 12h-9a6 6 0 000 12h1" />
              </svg>
            </button>
          </div>

          <div className="top-toolbar-group draw-weight-group">
            <label htmlFor="draw-weight-slider" className="draw-weight-label">
              Weight
            </label>
            <input
              id="draw-weight-slider"
              className="draw-weight-slider"
              type="range"
              min="0.8"
              max="4.8"
              step="0.1"
              value={clampStrokeSize(strokeSize)}
              onChange={(event) => {
                setStrokeSize(clampStrokeSize(Number(event.target.value)));
              }}
              disabled={!isStrokeEnabled}
              aria-label="Draw weight"
            />
            <span className="draw-weight-value">
              {clampStrokeSize(strokeSize).toFixed(1)}
            </span>
          </div>

          <div className="top-toolbar-group styles-chip-row">
            {favoriteStyles.slice(0, 4).map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="style-chip-button"
                onClick={() => applyStyle(preset)}
                title={`${TOOL_LABELS[preset.tool]} ${preset.size.toFixed(1)} ${preset.tip}`}
              >
                <span
                  className="style-chip-color"
                  style={{ backgroundColor: preset.color }}
                />
                <span>{preset.size.toFixed(1)}</span>
                <span>{preset.tip.slice(0, 2)}</span>
              </button>
            ))}
            <button
              type="button"
              className="toolbar-button"
              onClick={saveCurrentStyle}
              disabled={!canSaveStyle}
              title="Save current writing style"
            >
              Save Style
            </button>
          </div>

          <label className="top-toolbar-toggle">
            <input
              type="checkbox"
              checked={allowTouchInk}
              onChange={(event) => {
                setAllowTouchInk(event.target.checked);
              }}
            />
            Finger
          </label>
        </div>

        <div className="top-toolbar-row">
          <div className="top-toolbar-group tip-selector-group">
            {TIP_OPTIONS.map((tipOption) => (
              <button
                key={tipOption.value}
                type="button"
                className={
                  activeTip === tipOption.value
                    ? "toolbar-button tip-chip-button active"
                    : "toolbar-button tip-chip-button"
                }
                onClick={() => {
                  setActiveTip(tipOption.value);
                }}
                title={`${tipOption.label} tip`}
                disabled={!canSelectTip}
              >
                <span
                  className={`tip-chip-line tip-line-${tipOption.value}`}
                  aria-hidden="true"
                />
                <span>{tipOption.label}</span>
              </button>
            ))}
          </div>

          <div
            className="top-toolbar-group color-swatch-row"
            aria-label="Color swatches"
          >
            {visibleColorSwatches.map((savedColor) => (
              <button
                key={savedColor}
                type="button"
                className={
                  savedColor === activeColor
                    ? "swatch-button active"
                    : "swatch-button"
                }
                style={{ backgroundColor: savedColor }}
                onClick={() => {
                  setActiveColor(savedColor);
                }}
                aria-label={`Use color ${savedColor}`}
                disabled={!isPaletteEnabled}
              />
            ))}
          </div>

          <input
            className="top-color-picker"
            type="color"
            value={activeColor}
            onChange={(event) => {
              setActiveColor(event.target.value.toLowerCase());
            }}
            aria-label="Current color"
            disabled={!isPaletteEnabled}
          />

          <button
            type="button"
            className="toolbar-button"
            onClick={saveCurrentColor}
            disabled={!isPaletteEnabled}
          >
            Save Color
          </button>

          <div className="top-toolbar-group symbols-chip-row">
            {showShapeControls
              ? SHAPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={
                      option.value === shapeKind
                        ? "toolbar-button active"
                        : "toolbar-button"
                    }
                    onClick={() => {
                      setShapeKind(option.value);
                    }}
                    title={option.label}
                  >
                    {option.label}
                  </button>
                ))
              : null}

            {showElementControls
              ? SYMBOL_OPTIONS.map((option) => {
                  const isActive = option.value === activeSymbol;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      className={
                        isActive
                          ? "toolbar-button active symbol-button"
                          : "toolbar-button symbol-button"
                      }
                      onClick={() => {
                        setActiveSymbol(option.value);
                      }}
                      title={option.label}
                    >
                      {option.value || option.label}
                    </button>
                  );
                })
              : null}

            {showTextControls ? (
              <input
                type="text"
                value={textStamp}
                onChange={(event) => {
                  setTextStamp(event.target.value);
                }}
                className="top-toolbar-text-input"
                placeholder="Text stamp"
                maxLength={48}
                aria-label="Text stamp"
              />
            ) : null}

            {showImageControls ? (
              <>
                <button
                  type="button"
                  className="toolbar-button"
                  onClick={() => {
                    imageInputRef.current?.click();
                  }}
                >
                  Pick Image
                </button>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="toolbar-file-input"
                  onChange={handleImageFileChange}
                />
              </>
            ) : null}

          </div>
        </div>
      </header>

      <div className="app-layout">
        <div
          ref={plannerStageRef}
          className="planner-stage"
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
              year={DEFAULT_YEAR}
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
              onMonthChange={handleMonthTabChange}
              onWeekIndexChange={handleWeekTabChange}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
