import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
const SIZE_PRESETS = [1.1, 2.1, 3.1, 4.2];
const MIN_ZOOM_SCALE = 1;
const MAX_ZOOM_SCALE = 2.8;

type ShapeKind = "line" | "rectangle" | "ellipse";
type DrawingTool = "pen" | "pencil" | "highlighter" | "shape";
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
];

const SYMBOL_OPTIONS: SymbolOption[] = [
  { label: "Draw", value: "" },
  { label: "Check", value: "✓" },
  { label: "Star", value: "★" },
  { label: "Bullet", value: "•" },
  { label: "Arrow", value: "→" },
  { label: "Heart", value: "♥" },
];

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
): FavoriteStyle {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tool,
    color: color.toLowerCase(),
    size: clampStrokeSize(size),
  };
}

export default function App() {
  const [month, setMonth] = useState<number>(DEFAULT_MONTH);
  const [weekIndex, setWeekIndex] = useState<number>(DEFAULT_WEEK_INDEX);
  const [allowTouchInk, setAllowTouchInk] = useState<boolean>(true);
  const [activeTool, setActiveTool] = useState<InkTool>("pen");
  const [activeColor, setActiveColor] = useState<string>(DEFAULT_COLOR);
  const [strokeSize, setStrokeSize] = useState<number>(DEFAULT_STROKE_SIZE);
  const [activeSymbol, setActiveSymbol] = useState<string>("");
  const [shapeKind, setShapeKind] = useState<ShapeKind>("line");
  const [textStamp, setTextStamp] = useState<string>("note");
  const [stickyTemplate, setStickyTemplate] = useState<string>("new note");
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
  const pinchGestureRef = useRef<PinchGestureState | null>(null);
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
    activeTool !== "image" &&
    activeTool !== "sticky";
  const showShapeControls = activeTool === "shape";
  const showElementControls = activeTool === "elements";
  const showTextControls = activeTool === "text";
  const showImageControls = activeTool === "image";
  const showStickyControls = activeTool === "sticky";

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
      if (event.touches.length === 1) {
        event.preventDefault();
      }
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

  const toggleEraserFromPencilDoubleTap = () => {
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
  };

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

  const handleStagePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.pointerType !== "touch") {
      return;
    }

    activeTouchPointsRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activeTouchPointsRef.current.size >= 2) {
      beginPinchGesture();
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const handleStagePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
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

    if (activeTouchPointsRef.current.size < 2) {
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
    if (event.pointerType !== "touch") {
      return;
    }

    const hadPinch = pinchGestureRef.current !== null;
    activeTouchPointsRef.current.delete(event.pointerId);
    if (activeTouchPointsRef.current.size < 2) {
      pinchGestureRef.current = null;
    }

    if (hadPinch) {
      event.preventDefault();
      event.stopPropagation();
    }
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

    setFavoriteStyles((current) => {
      const exists = current.some(
        (preset) =>
          preset.tool === activeTool &&
          preset.color === normalizedColor &&
          Math.abs(preset.size - normalizedSize) < 0.001,
      );

      if (exists) {
        return current;
      }

      return [
        makeFavoriteStyle(activeTool, normalizedColor, normalizedSize),
        ...current,
      ].slice(0, FAVORITE_STYLE_LIMIT);
    });
  };

  const applyStyle = (preset: FavoriteStyle) => {
    setActiveTool(preset.tool);
    setActiveColor(preset.color);
    setStrokeSize(preset.size);
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

  const handleToolbarPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "pen") {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest("button") as HTMLButtonElement | null;
    if (button && !button.disabled) {
      event.preventDefault();
      button.click();
      return;
    }

    const colorInput = target.closest(
      'input[type="color"]',
    ) as HTMLInputElement | null;
    if (colorInput && !colorInput.disabled) {
      event.preventDefault();
      colorInput.focus();
      colorInput.click();
      return;
    }

    const checkboxInput = target.closest(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    if (checkboxInput && !checkboxInput.disabled) {
      event.preventDefault();
      checkboxInput.click();
      return;
    }

    const textInput = target.closest(
      'input[type="text"], textarea',
    ) as HTMLInputElement | HTMLTextAreaElement | null;
    if (textInput && !textInput.matches(":disabled")) {
      textInput.focus();
    }
  };

  return (
    <main className="app-shell">
      <header
        className="top-ink-toolbar"
        aria-label="Writing tools"
        onPointerDownCapture={handleToolbarPointerDown}
      >
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
                onClick={() => {
                  setTool(tool);
                }}
                title={TOOL_LABELS[tool]}
                aria-label={TOOL_LABELS[tool]}
              >
                <ToolIcon tool={tool} />
                <span className="sr-only">{TOOL_LABELS[tool]}</span>
              </button>
            ))}
          </div>

          <div className="top-toolbar-group">
            {SIZE_PRESETS.map((sizePreset) => (
              <button
                key={`size-${sizePreset}`}
                type="button"
                className={
                  isStrokeEnabled &&
                  Math.abs(clampStrokeSize(strokeSize) - sizePreset) < 0.06
                    ? "toolbar-button active"
                    : "toolbar-button"
                }
                onClick={() => {
                  setStrokeSize(sizePreset);
                }}
                title={`Stroke ${sizePreset.toFixed(1)}`}
                disabled={!isStrokeEnabled}
              >
                {sizePreset.toFixed(1)}
              </button>
            ))}
          </div>

          <div className="top-toolbar-group styles-chip-row">
            {favoriteStyles.slice(0, 4).map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="style-chip-button"
                onClick={() => applyStyle(preset)}
                title={`${TOOL_LABELS[preset.tool]} ${preset.size.toFixed(1)}`}
              >
                <span
                  className="style-chip-color"
                  style={{ backgroundColor: preset.color }}
                />
                <span>{preset.size.toFixed(1)}</span>
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

            {showStickyControls ? (
              <input
                type="text"
                value={stickyTemplate}
                onChange={(event) => {
                  setStickyTemplate(event.target.value);
                }}
                className="top-toolbar-text-input"
                placeholder="Post-it text"
                maxLength={140}
                aria-label="Default post-it text"
              />
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
              inkMode={activeInkMode}
              inkShapeKind={shapeKind}
              inkImageSrc={activeTool === "image" ? imageStampSrc : null}
              inkEraseRadius={eraseRadius}
              inkStickyTemplate={stickyTemplate}
              onPenDoubleTap={toggleEraserFromPencilDoubleTap}
              onMonthChange={handleMonthTabChange}
              onWeekIndexChange={handleWeekTabChange}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
