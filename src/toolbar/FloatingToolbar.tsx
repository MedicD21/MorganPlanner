import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  clampStrokeSize,
  DEFAULT_COLOR_PALETTE,
  isDrawingTool,
  isHexColor,
  SHAPE_OPTIONS,
  SYMBOL_OPTIONS,
  TIP_OPTIONS,
  TOOL_LABELS,
  type FavoriteStyle,
  type InkShapeKind,
  type InkTipKind,
  type InkTool,
} from "../planner/plannerShared";
import "./FloatingToolbar.css";

// ─── Constants ────────────────────────────────────────────────────────────────

const TOOLBAR_POSITION_KEY = "planner-toolbar-position-v1";
const TOOLBAR_COLLAPSED_KEY = "planner-toolbar-collapsed-v1";
const TOOLBAR_QUICK_SLOTS_KEY = "planner-toolbar-quick-slots-v1";
const PENCIL_DOUBLE_TAP_MS = 340;
const FAVORITE_COLOR_LIMIT = 12;
const FAVORITE_STYLE_LIMIT = 8;

const DEFAULT_QUICK_SLOTS: InkTool[] = ["pen", "pencil", "highlighter", "eraser"];

type ToolbarPosition = "side" | "top";

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadPosition(): ToolbarPosition {
  try {
    const raw = localStorage.getItem(TOOLBAR_POSITION_KEY);
    if (raw === "top" || raw === "side") return raw;
  } catch { /* ignore */ }
  return "side";
}

function loadCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(TOOLBAR_COLLAPSED_KEY);
    if (raw !== null) return JSON.parse(raw) as boolean;
  } catch { /* ignore */ }
  return false;
}

function loadQuickSlots(): InkTool[] {
  try {
    const raw = localStorage.getItem(TOOLBAR_QUICK_SLOTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.length === 4 &&
        parsed.every((v) => typeof v === "string" && v in TOOL_LABELS)
      ) {
        return parsed as InkTool[];
      }
    }
  } catch { /* ignore */ }
  return [...DEFAULT_QUICK_SLOTS];
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface FloatingToolbarProps {
  activeTool: InkTool;
  activeColor: string;
  strokeSize: number;
  activeTip: InkTipKind;
  activeSymbol: string;
  shapeKind: InkShapeKind;
  textStamp: string;
  allowTouchInk: boolean;
  imageStampSrc: string | null;
  favoriteColors: string[];
  favoriteStyles: FavoriteStyle[];
  canSaveStyle: boolean;
  onToolChange: (tool: InkTool, tapTime: number) => void;
  onColorChange: (color: string) => void;
  onSizeChange: (size: number) => void;
  onTipChange: (tip: InkTipKind) => void;
  onSymbolChange: (symbol: string) => void;
  onShapeKindChange: (kind: InkShapeKind) => void;
  onTextStampChange: (text: string) => void;
  onTouchInkChange: (allow: boolean) => void;
  onSaveColor: () => void;
  onSaveStyle: () => void;
  onApplyStyle: (style: FavoriteStyle) => void;
  onDeleteStyle: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onImageFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ToolIcon({ tool, size = 18 }: { tool: InkTool; size?: number }) {
  const s = `${size}px`;
  const strokeW = 1.7;

  if (tool === "pen") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 19l4-1 8-8-3-3-8 8-1 4z" />
        <path d="M13 6l3 3" />
      </svg>
    );
  }
  if (tool === "pencil") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 17l3 3 11-11-3-3L4 17z" />
        <path d="M3 21l4-1-3-3-1 4z" />
      </svg>
    );
  }
  if (tool === "highlighter") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 7h8l3 3v7H6z" />
        <path d="M6 14h11" />
      </svg>
    );
  }
  if (tool === "eraser") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 15l6-8 7 5-6 8H6z" />
        <path d="M4 19h16" />
      </svg>
    );
  }
  if (tool === "bucket") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 11l6-6 6 6-6 6-6-6z" />
        <path d="M4 18h16" />
      </svg>
    );
  }
  if (tool === "shape") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="4.5" width="8" height="8" rx="1" />
        <circle cx="16.5" cy="16.5" r="4" />
      </svg>
    );
  }
  if (tool === "lasso") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 9c0-3 3-5 7-5s7 2 7 5-3 5-7 5-7-2-7-5z" />
        <path d="M12 14v4c0 1-1 2-2 2" />
      </svg>
    );
  }
  if (tool === "elements") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
        <path d="M12 4l2.2 4.7 5.1.7-3.7 3.6.9 5.1-4.5-2.4-4.5 2.4.9-5.1-3.7-3.6 5.1-.7z" />
      </svg>
    );
  }
  if (tool === "text") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 6h16M12 6v13M8 19h8" />
      </svg>
    );
  }
  if (tool === "image") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M6 16l4-4 3 3 3-5 2 6" />
        <circle cx="8" cy="9" r="1.4" />
      </svg>
    );
  }
  if (tool === "sticky") {
    return (
      <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="4" width="15" height="15" rx="1.8" />
        <path d="M13 19v-4.5c0-.9.7-1.5 1.5-1.5H19" />
      </svg>
    );
  }
  return null;
}

function UndoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 7L4 12l5 5" /><path d="M5 12h9a6 6 0 010 12h-1" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 7l5 5-5 5" /><path d="M19 12h-9a6 6 0 000 12h1" />
    </svg>
  );
}

function ZoomInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35M8 11h6" />
    </svg>
  );
}

function PalmIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 11V5a2 2 0 014 0v4" />
      <path d="M11 5V3a2 2 0 014 0v6" />
      <path d="M15 7a2 2 0 014 0v6c0 4-3 7-7 7s-7-3-7-7v-2a2 2 0 014 0" />
    </svg>
  );
}

function ChevronIcon({ dir }: { dir: "left" | "right" | "up" | "down" }) {
  const paths: Record<string, string> = {
    left: "M15 18l-6-6 6-6",
    right: "M9 18l6-6-6-6",
    up: "M18 15l-6-6-6 6",
    down: "M6 9l6 6 6-6",
  };
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[dir]} />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FloatingToolbar(props: FloatingToolbarProps) {
  const {
    activeTool,
    activeColor,
    strokeSize,
    activeTip,
    activeSymbol,
    shapeKind,
    textStamp,
    allowTouchInk,
    favoriteColors,
    favoriteStyles,
    canSaveStyle,
    onToolChange,
    onColorChange,
    onSizeChange,
    onTipChange,
    onSymbolChange,
    onShapeKindChange,
    onTextStampChange,
    onTouchInkChange,
    onSaveColor,
    onSaveStyle,
    onApplyStyle,
    onDeleteStyle,
    onUndo,
    onRedo,
    onZoomIn,
    onZoomOut,
    onImageFileChange,
  } = props;

  const [position, setPosition] = useState<ToolbarPosition>(loadPosition);
  const [collapsed, setCollapsed] = useState<boolean>(loadCollapsed);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [colorPopoverOpen, setColorPopoverOpen] = useState(false);
  const [quickSlots, setQuickSlots] = useState<InkTool[]>(loadQuickSlots);
  const [slotPickerIndex, setSlotPickerIndex] = useState<number | null>(null);

  const imageInputRef = useRef<HTMLInputElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
  const colorPopoverRef = useRef<HTMLDivElement>(null);
  const lastPencilTapRef = useRef<number>(0);

  // Persist state
  useEffect(() => {
    try { localStorage.setItem(TOOLBAR_POSITION_KEY, position); } catch { /* ignore */ }
  }, [position]);

  useEffect(() => {
    try { localStorage.setItem(TOOLBAR_COLLAPSED_KEY, JSON.stringify(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem(TOOLBAR_QUICK_SLOTS_KEY, JSON.stringify(quickSlots)); } catch { /* ignore */ }
  }, [quickSlots]);

  // Update CSS variable so the canvas shrinks correctly in top mode.
  useLayoutEffect(() => {
    const height = position === "top" && !collapsed ? "52px" : "0px";
    document.documentElement.style.setProperty("--floating-toolbar-height", height);
    return () => {
      document.documentElement.style.setProperty("--floating-toolbar-height", "0px");
    };
  }, [position, collapsed]);

  // Close overflow when switching tools.
  useEffect(() => {
    setOverflowOpen(false);
    setColorPopoverOpen(false);
    setSlotPickerIndex(null);
  }, [activeTool]);

  // Close popovers on outside click.
  useEffect(() => {
    const handleOutside = (e: PointerEvent) => {
      if (
        overflowRef.current &&
        !overflowRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
        setSlotPickerIndex(null);
      }
      if (
        colorPopoverRef.current &&
        !colorPopoverRef.current.contains(e.target as Node)
      ) {
        setColorPopoverOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleOutside, true);
    return () => document.removeEventListener("pointerdown", handleOutside, true);
  }, []);

  const handleToolBtn = useCallback(
    (tool: InkTool, tapTime: number) => {
      if (tool === "pencil") {
        if (
          activeTool === "pencil" &&
          tapTime - lastPencilTapRef.current <= PENCIL_DOUBLE_TAP_MS
        ) {
          lastPencilTapRef.current = 0;
          onToolChange("eraser", tapTime);
          return;
        }
        lastPencilTapRef.current = tapTime;
      } else {
        lastPencilTapRef.current = 0;
      }
      onToolChange(tool, tapTime);
    },
    [activeTool, onToolChange],
  );

  const assignQuickSlot = (slotIdx: number, tool: InkTool) => {
    setQuickSlots((prev) => {
      const next = [...prev] as InkTool[];
      next[slotIdx] = tool;
      return next;
    });
    setSlotPickerIndex(null);
  };

  const visibleColorSwatches = (() => {
    const merged = [...favoriteColors];
    for (const c of DEFAULT_COLOR_PALETTE) {
      if (!merged.includes(c)) merged.push(c);
    }
    return merged.slice(0, FAVORITE_COLOR_LIMIT);
  })();

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

  const canSelectTip = isDrawingTool(activeTool);
  const showShapeControls = activeTool === "shape";
  const showElementControls = activeTool === "elements";
  const showTextControls = activeTool === "text";
  const showImageControls = activeTool === "image";

  const collapseChevron =
    position === "side"
      ? collapsed ? "left" : "right"
      : collapsed ? "down" : "up";

  const positionIcon = position === "side" ? "↕" : "↔";

  // ── Overflow panel content ──────────────────────────────────────────────────

  const overflowPanel = overflowOpen ? (
    <div
      ref={overflowRef}
      className={`ft-overflow-panel ft-overflow-${position}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* All tools */}
      <div className="ft-section">
        <div className="ft-section-label">Tools</div>
        <div className="ft-tool-grid">
          {(Object.keys(TOOL_LABELS) as InkTool[]).map((tool) => (
            <button
              key={tool}
              type="button"
              className={`ft-tool-btn ft-tool-btn-lg ${activeTool === tool ? "active" : ""}`}
              onClick={(e) => {
                handleToolBtn(tool, e.timeStamp);
                setOverflowOpen(false);
              }}
              title={TOOL_LABELS[tool]}
              aria-label={TOOL_LABELS[tool]}
              aria-pressed={activeTool === tool}
            >
              <ToolIcon tool={tool} size={16} />
              <span className="ft-tool-label">{TOOL_LABELS[tool]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Quick slot assignment */}
      <div className="ft-section">
        <div className="ft-section-label">Quick Slots</div>
        <div className="ft-slot-row">
          {quickSlots.map((slotTool, idx) => (
            <div key={idx} className="ft-slot-item">
              <button
                type="button"
                className={`ft-tool-btn ${slotPickerIndex === idx ? "active" : ""}`}
                onClick={() =>
                  setSlotPickerIndex(slotPickerIndex === idx ? null : idx)
                }
                title={`Slot ${idx + 1}: ${TOOL_LABELS[slotTool]} — tap to reassign`}
              >
                <ToolIcon tool={slotTool} size={14} />
              </button>
              <span className="ft-slot-label">{idx + 1}</span>
            </div>
          ))}
        </div>
        {slotPickerIndex !== null && (
          <div className="ft-slot-picker">
            <div className="ft-slot-picker-label">
              Assign slot {slotPickerIndex + 1}:
            </div>
            <div className="ft-tool-grid ft-tool-grid-sm">
              {(Object.keys(TOOL_LABELS) as InkTool[]).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  className={`ft-tool-btn ${quickSlots[slotPickerIndex] === tool ? "active" : ""}`}
                  onClick={() => assignQuickSlot(slotPickerIndex, tool)}
                  title={TOOL_LABELS[tool]}
                  aria-label={TOOL_LABELS[tool]}
                >
                  <ToolIcon tool={tool} size={13} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Color */}
      <div className="ft-section">
        <div className="ft-section-label">Color</div>
        <div className="ft-swatch-grid">
          {visibleColorSwatches.map((c) => (
            <button
              key={c}
              type="button"
              className={`ft-swatch ${c === activeColor ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => onColorChange(c)}
              aria-label={`Color ${c}`}
              disabled={!isPaletteEnabled}
            />
          ))}
        </div>
        <div className="ft-color-row">
          <input
            type="color"
            className="ft-color-picker"
            value={activeColor}
            onChange={(e) => onColorChange(e.target.value.toLowerCase())}
            disabled={!isPaletteEnabled}
            aria-label="Custom color"
          />
          <button
            type="button"
            className="ft-btn ft-btn-sm"
            onClick={onSaveColor}
            disabled={!isPaletteEnabled}
          >
            Save Color
          </button>
        </div>
      </div>

      {/* Weight */}
      <div className="ft-section">
        <div className="ft-section-label">
          Weight — {clampStrokeSize(strokeSize).toFixed(1)}
        </div>
        <input
          type="range"
          className="ft-slider"
          min="0.8"
          max="4.8"
          step="0.1"
          value={clampStrokeSize(strokeSize)}
          onChange={(e) => onSizeChange(clampStrokeSize(Number(e.target.value)))}
          disabled={!isStrokeEnabled}
          aria-label="Stroke weight"
        />
      </div>

      {/* Tips */}
      <div className="ft-section">
        <div className="ft-section-label">Tip</div>
        <div className="ft-tip-row">
          {TIP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`ft-btn ft-btn-sm ft-tip-btn ${activeTip === opt.value ? "active" : ""}`}
              onClick={() => onTipChange(opt.value)}
              disabled={!canSelectTip}
              title={`${opt.label} tip`}
            >
              <span className={`ft-tip-line ft-tip-${opt.value}`} aria-hidden="true" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contextual controls */}
      {showShapeControls && (
        <div className="ft-section">
          <div className="ft-section-label">Shape</div>
          <div className="ft-row ft-row-wrap">
            {SHAPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`ft-btn ft-btn-sm ${shapeKind === opt.value ? "active" : ""}`}
                onClick={() => onShapeKindChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showElementControls && (
        <div className="ft-section">
          <div className="ft-section-label">Symbol</div>
          <div className="ft-row ft-row-wrap">
            {SYMBOL_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={`ft-btn ft-btn-sm ft-symbol-btn ${activeSymbol === opt.value ? "active" : ""}`}
                onClick={() => onSymbolChange(opt.value)}
                title={opt.label}
              >
                {opt.value || opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showTextControls && (
        <div className="ft-section">
          <div className="ft-section-label">Text Stamp</div>
          <input
            type="text"
            className="ft-text-input"
            value={textStamp}
            onChange={(e) => onTextStampChange(e.target.value)}
            placeholder="Text stamp"
            maxLength={48}
          />
        </div>
      )}

      {showImageControls && (
        <div className="ft-section">
          <div className="ft-section-label">Image</div>
          <button
            type="button"
            className="ft-btn ft-btn-sm"
            onClick={() => imageInputRef.current?.click()}
          >
            Pick Image
          </button>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png, image/jpeg, image/webp"
            style={{ display: "none" }}
            onChange={onImageFileChange}
          />
        </div>
      )}

      {/* Favorite styles */}
      <div className="ft-section">
        <div className="ft-section-label-row">
          <span className="ft-section-label">Saved Styles</span>
          <button
            type="button"
            className="ft-btn ft-btn-xs"
            onClick={() => {
              onSaveStyle();
            }}
            disabled={!canSaveStyle}
            title="Save current style"
          >
            + Save
          </button>
        </div>
        {favoriteStyles.length === 0 && (
          <p className="ft-empty">No saved styles yet.</p>
        )}
        {favoriteStyles.slice(0, FAVORITE_STYLE_LIMIT).map((preset) => (
          <div key={preset.id} className="ft-style-row">
            <button
              type="button"
              className="ft-style-btn"
              onClick={() => {
                onApplyStyle(preset);
                setOverflowOpen(false);
              }}
              title={`${TOOL_LABELS[preset.tool]} · ${preset.size.toFixed(1)} · ${preset.tip}`}
            >
              <span
                className="ft-style-swatch"
                style={{ background: preset.color }}
              />
              <span className="ft-style-meta">
                {TOOL_LABELS[preset.tool]} · {preset.size.toFixed(1)} · {preset.tip}
              </span>
            </button>
            <button
              type="button"
              className="ft-btn ft-btn-xs ft-delete-btn"
              onClick={() => onDeleteStyle(preset.id)}
              title="Delete style"
              aria-label="Delete style"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Touch ink toggle */}
      <div className="ft-section ft-touch-section">
        <label className="ft-toggle-row">
          <input
            type="checkbox"
            checked={allowTouchInk}
            onChange={(e) => onTouchInkChange(e.target.checked)}
          />
          <span>Finger Drawing</span>
        </label>
      </div>

      {/* Toolbar position */}
      <div className="ft-section">
        <div className="ft-section-label">Toolbar Position</div>
        <div className="ft-row">
          <button
            type="button"
            className={`ft-btn ft-btn-sm ${position === "side" ? "active" : ""}`}
            onClick={() => {
              setPosition("side");
              setOverflowOpen(false);
            }}
          >
            Side
          </button>
          <button
            type="button"
            className={`ft-btn ft-btn-sm ${position === "top" ? "active" : ""}`}
            onClick={() => {
              setPosition("top");
              setOverflowOpen(false);
            }}
          >
            Top
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // ── Color popover ───────────────────────────────────────────────────────────

  const colorPopover = colorPopoverOpen ? (
    <div
      ref={colorPopoverRef}
      className={`ft-color-popover ft-color-popover-${position}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="ft-swatch-grid">
        {visibleColorSwatches.map((c) => (
          <button
            key={c}
            type="button"
            className={`ft-swatch ${c === activeColor ? "active" : ""}`}
            style={{ background: c }}
            onClick={() => {
              onColorChange(c);
              setColorPopoverOpen(false);
            }}
            aria-label={`Color ${c}`}
            disabled={!isPaletteEnabled}
          />
        ))}
      </div>
      <div className="ft-color-row">
        <input
          type="color"
          className="ft-color-picker"
          value={activeColor}
          onChange={(e) => {
            const v = e.target.value.toLowerCase();
            if (isHexColor(v)) onColorChange(v);
          }}
          disabled={!isPaletteEnabled}
          aria-label="Custom color"
        />
        <button
          type="button"
          className="ft-btn ft-btn-sm"
          onClick={() => {
            onSaveColor();
            setColorPopoverOpen(false);
          }}
          disabled={!isPaletteEnabled}
        >
          Save
        </button>
      </div>
    </div>
  ) : null;

  // ── Render ──────────────────────────────────────────────────────────────────

  const railButtons = (
    <>
      {/* Active color/tool indicator — tap to open color popover */}
      <div className="ft-active-indicator" title={`Active: ${TOOL_LABELS[activeTool]}`}>
        <button
          type="button"
          className="ft-color-dot-btn"
          style={{ background: isPaletteEnabled ? activeColor : "#c8c2bb" }}
          onClick={() => setColorPopoverOpen((v) => !v)}
          aria-label="Color picker"
          title="Tap to pick color"
          disabled={!isPaletteEnabled}
        />
        <span className="ft-active-tool-name sr-only">{TOOL_LABELS[activeTool]}</span>
      </div>

      <div className="ft-divider" aria-hidden="true" />

      {/* Quick slots */}
      {quickSlots.map((slotTool, idx) => (
        <button
          key={`slot-${idx}`}
          type="button"
          className={`ft-tool-btn ${activeTool === slotTool ? "active" : ""}`}
          onClick={(e) => handleToolBtn(slotTool, e.timeStamp)}
          title={TOOL_LABELS[slotTool]}
          aria-label={TOOL_LABELS[slotTool]}
          aria-pressed={activeTool === slotTool}
        >
          <ToolIcon tool={slotTool} size={18} />
        </button>
      ))}

      <div className="ft-divider" aria-hidden="true" />

      {/* Undo / Redo */}
      <button
        type="button"
        className="ft-tool-btn"
        onClick={onUndo}
        title="Undo"
        aria-label="Undo"
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        className="ft-tool-btn"
        onClick={onRedo}
        title="Redo"
        aria-label="Redo"
      >
        <RedoIcon />
      </button>

      <div className="ft-divider" aria-hidden="true" />

      {/* Zoom */}
      <button
        type="button"
        className="ft-tool-btn"
        onClick={onZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <ZoomInIcon />
      </button>
      <button
        type="button"
        className="ft-tool-btn"
        onClick={onZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <ZoomOutIcon />
      </button>

      <div className="ft-divider" aria-hidden="true" />

      {/* Touch ink toggle */}
      <button
        type="button"
        className={`ft-tool-btn ${allowTouchInk ? "active" : ""}`}
        onClick={() => onTouchInkChange(!allowTouchInk)}
        title={allowTouchInk ? "Finger drawing on" : "Finger drawing off"}
        aria-label="Toggle finger drawing"
        aria-pressed={allowTouchInk}
      >
        <PalmIcon active={allowTouchInk} />
      </button>

      {/* More / overflow */}
      <button
        type="button"
        className={`ft-tool-btn ${overflowOpen ? "active" : ""}`}
        onClick={() => setOverflowOpen((v) => !v)}
        title="More options"
        aria-label="More options"
        aria-expanded={overflowOpen}
      >
        <MoreIcon />
      </button>
    </>
  );

  if (position === "side") {
    return (
      <div className="ft-root ft-side" aria-label="Drawing toolbar">
        <div className="ft-rail ft-rail-side">
          {/* Collapse toggle */}
          <button
            type="button"
            className="ft-collapse-btn"
            onClick={() => setCollapsed((v) => !v)}
            title={collapsed ? "Expand toolbar" : "Collapse toolbar"}
            aria-label={collapsed ? "Expand toolbar" : "Collapse toolbar"}
          >
            <ChevronIcon dir={collapseChevron} />
          </button>

          {/* Position toggle */}
          <button
            type="button"
            className="ft-tool-btn ft-position-btn"
            onClick={() => setPosition("top")}
            title="Move toolbar to top"
            aria-label="Move toolbar to top"
          >
            <span aria-hidden="true">{positionIcon}</span>
          </button>

          {!collapsed && railButtons}
        </div>

        {!collapsed && colorPopover}
        {!collapsed && overflowPanel}
      </div>
    );
  }

  // Top mode
  return (
    <div className="ft-root ft-top" aria-label="Drawing toolbar">
      <div className="ft-rail ft-rail-top">
        {/* Collapse toggle */}
        <button
          type="button"
          className="ft-collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? "Expand toolbar" : "Collapse toolbar"}
          aria-label={collapsed ? "Expand toolbar" : "Collapse toolbar"}
        >
          <ChevronIcon dir={collapseChevron} />
        </button>

        {/* Position toggle */}
        <button
          type="button"
          className="ft-tool-btn ft-position-btn"
          onClick={() => setPosition("side")}
          title="Move toolbar to side"
          aria-label="Move toolbar to side"
        >
          <span aria-hidden="true">{positionIcon}</span>
        </button>

        {!collapsed && <div className="ft-rail-top-content">{railButtons}</div>}
      </div>

      {!collapsed && colorPopover}
      {!collapsed && overflowPanel}
    </div>
  );
}
