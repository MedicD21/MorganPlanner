import { useEffect, useMemo, useState } from "react";
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

type DrawingTool = "pen" | "pencil" | "highlighter";
type InkTool = DrawingTool | "eraser";

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

const TOOL_LABELS: Record<InkTool, string> = {
  pen: "Pen",
  pencil: "Pencil",
  highlighter: "Highlighter",
  eraser: "Eraser",
};

const SYMBOL_OPTIONS: SymbolOption[] = [
  { label: "Draw", value: "" },
  { label: "Check", value: "✓" },
  { label: "Star", value: "★" },
  { label: "Bullet", value: "•" },
  { label: "Arrow", value: "→" },
  { label: "Heart", value: "♥" },
];

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

  const validTools = new Set<DrawingTool>(["pen", "pencil", "highlighter"]);
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

function makeFavoriteStyle(tool: DrawingTool, color: string, size: number): FavoriteStyle {
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
  const [favoriteColors, setFavoriteColors] = useState<string[]>(loadFavoriteColors);
  const [favoriteStyles, setFavoriteStyles] = useState<FavoriteStyle[]>(loadFavoriteStyles);

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

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITE_COLORS_STORAGE_KEY, JSON.stringify(favoriteColors));
    } catch {
      // Ignore storage write failures.
    }
  }, [favoriteColors]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITE_STYLES_STORAGE_KEY, JSON.stringify(favoriteStyles));
    } catch {
      // Ignore storage write failures.
    }
  }, [favoriteStyles]);

  const handleMonthTabChange = (nextMonth: number) => {
    setMonth(nextMonth);
    setWeekIndex(0);
  };

  const handleWeekTabChange = (nextWeekIndex: number) => {
    setWeekIndex(nextWeekIndex);
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
    if (activeTool === "eraser") {
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

      return [makeFavoriteStyle(activeTool, normalizedColor, normalizedSize), ...current].slice(
        0,
        FAVORITE_STYLE_LIMIT,
      );
    });
  };

  const applyStyle = (preset: FavoriteStyle) => {
    setActiveTool(preset.tool);
    setActiveColor(preset.color);
    setStrokeSize(preset.size);
    setActiveSymbol("");
  };

  return (
    <main className="app-shell">
      <header className="top-ink-toolbar" aria-label="Writing tools">
        <div className="top-toolbar-row">
          <div className="top-toolbar-group">
            {(["pen", "pencil", "highlighter", "eraser"] as InkTool[]).map((tool) => (
              <button
                key={tool}
                type="button"
                className={tool === activeTool ? "toolbar-button active" : "toolbar-button"}
                onClick={() => {
                  setActiveTool(tool);
                  if (tool === "eraser") {
                    setActiveSymbol("");
                  }
                }}
                title={TOOL_LABELS[tool]}
              >
                {TOOL_LABELS[tool]}
              </button>
            ))}
          </div>

          <div className="top-toolbar-group">
            {SIZE_PRESETS.map((sizePreset) => (
              <button
                key={`size-${sizePreset}`}
                type="button"
                className={
                  Math.abs(clampStrokeSize(strokeSize) - sizePreset) < 0.06
                    ? "toolbar-button active"
                    : "toolbar-button"
                }
                onClick={() => {
                  setStrokeSize(sizePreset);
                }}
                title={`Stroke ${sizePreset.toFixed(1)}`}
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
                <span className="style-chip-color" style={{ backgroundColor: preset.color }} />
                <span>{preset.size.toFixed(1)}</span>
              </button>
            ))}
            <button
              type="button"
              className="toolbar-button"
              onClick={saveCurrentStyle}
              disabled={activeTool === "eraser"}
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
            Touch
          </label>
        </div>

        <div className="top-toolbar-row">
          <div className="top-toolbar-group color-swatch-row" aria-label="Color swatches">
            {visibleColorSwatches.map((savedColor) => (
              <button
                key={savedColor}
                type="button"
                className={savedColor === activeColor ? "swatch-button active" : "swatch-button"}
                style={{ backgroundColor: savedColor }}
                onClick={() => {
                  setActiveColor(savedColor);
                }}
                aria-label={`Use color ${savedColor}`}
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
          />

          <button type="button" className="toolbar-button" onClick={saveCurrentColor}>
            Save Color
          </button>

          <div className="top-toolbar-group symbols-chip-row">
            {SYMBOL_OPTIONS.map((option) => {
              const isActive = option.value === activeSymbol;
              return (
                <button
                  key={option.label}
                  type="button"
                  className={isActive ? "toolbar-button active symbol-button" : "toolbar-button symbol-button"}
                  onClick={() => {
                    if (activeTool !== "eraser") {
                      setActiveSymbol(option.value);
                    }
                  }}
                  title={option.label}
                  disabled={activeTool === "eraser"}
                >
                  {option.value || option.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="app-layout">
        <div className="planner-stage">
          <MonthlyView
            year={DEFAULT_YEAR}
            month={month}
            weekIndex={weekIndex}
            allowTouchInk={allowTouchInk}
            inkColor={activeColor}
            inkLineWidth={effectiveInk.lineWidth}
            inkOpacity={effectiveInk.opacity}
            inkSymbol={activeTool === "eraser" ? null : activeSymbol || null}
            inkMode={activeTool === "eraser" ? "erase" : "draw"}
            inkEraseRadius={eraseRadius}
            onMonthChange={handleMonthTabChange}
            onWeekIndexChange={handleWeekTabChange}
          />
        </div>
      </div>
    </main>
  );
}
