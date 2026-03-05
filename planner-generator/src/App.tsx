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

type InkTool = "pen" | "pencil" | "highlighter";

interface FavoriteStyle {
  id: string;
  tool: InkTool;
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

  const validTools = new Set<InkTool>(["pen", "pencil", "highlighter"]);
  const styles: FavoriteStyle[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const candidate = entry as Partial<FavoriteStyle>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.tool !== "string" ||
      !validTools.has(candidate.tool as InkTool) ||
      typeof candidate.color !== "string" ||
      !isHexColor(candidate.color) ||
      typeof candidate.size !== "number"
    ) {
      continue;
    }

    styles.push({
      id: candidate.id,
      tool: candidate.tool as InkTool,
      color: candidate.color.toLowerCase(),
      size: clampStrokeSize(candidate.size),
    });

    if (styles.length >= FAVORITE_STYLE_LIMIT) {
      break;
    }
  }

  return styles;
}

function makeFavoriteStyle(tool: InkTool, color: string, size: number): FavoriteStyle {
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
  const [allowTouchInk, setAllowTouchInk] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<InkTool>("pen");
  const [activeColor, setActiveColor] = useState<string>(DEFAULT_COLOR);
  const [strokeSize, setStrokeSize] = useState<number>(DEFAULT_STROKE_SIZE);
  const [activeSymbol, setActiveSymbol] = useState<string>("");
  const [favoriteColors, setFavoriteColors] = useState<string[]>(loadFavoriteColors);
  const [favoriteStyles, setFavoriteStyles] = useState<FavoriteStyle[]>(loadFavoriteStyles);

  const effectiveInk = useMemo(() => {
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
            inkSymbol={activeSymbol || null}
            onMonthChange={handleMonthTabChange}
            onWeekIndexChange={handleWeekTabChange}
          />
        </div>

        <aside className="ink-toolbar" aria-label="Writing tools">
          <h2>Writing Tools</h2>
          <p className="ink-toolbar-subtitle">
            {activeSymbol ? `Symbol mode: ${activeSymbol}` : `${TOOL_LABELS[activeTool]} mode`}
          </p>

          <section className="toolbar-section">
            <h3>Tool</h3>
            <div className="tool-button-row">
              {(["pen", "pencil", "highlighter"] as InkTool[]).map((tool) => (
                <button
                  key={tool}
                  type="button"
                  className={tool === activeTool ? "toolbar-button active" : "toolbar-button"}
                  onClick={() => {
                    setActiveTool(tool);
                    setActiveSymbol("");
                  }}
                >
                  {TOOL_LABELS[tool]}
                </button>
              ))}
            </div>
          </section>

          <section className="toolbar-section">
            <h3>Color</h3>
            <label className="toolbar-field-label" htmlFor="ink-color-picker">
              Current color
            </label>
            <div className="color-picker-row">
              <input
                id="ink-color-picker"
                type="color"
                value={activeColor}
                onChange={(event) => {
                  setActiveColor(event.target.value.toLowerCase());
                }}
              />
              <span>{activeColor.toUpperCase()}</span>
            </div>
            <div className="toolbar-action-row">
              <button type="button" className="toolbar-button" onClick={saveCurrentColor}>
                Save Color
              </button>
            </div>
            <div className="swatch-grid" aria-label="Favorite colors">
              {favoriteColors.length ? (
                favoriteColors.map((savedColor) => (
                  <button
                    key={savedColor}
                    type="button"
                    className={savedColor === activeColor ? "swatch-button active" : "swatch-button"}
                    style={{ backgroundColor: savedColor }}
                    onClick={() => {
                      setActiveColor(savedColor);
                      setActiveSymbol("");
                    }}
                    aria-label={`Use color ${savedColor}`}
                    title={savedColor.toUpperCase()}
                  />
                ))
              ) : (
                <span className="toolbar-empty">No saved colors yet.</span>
              )}
            </div>
          </section>

          <section className="toolbar-section">
            <h3>Stroke</h3>
            <label className="toolbar-field-label" htmlFor="ink-size-slider">
              Base size: {clampStrokeSize(strokeSize).toFixed(1)}
            </label>
            <input
              id="ink-size-slider"
              type="range"
              min={0.8}
              max={4.8}
              step={0.1}
              value={strokeSize}
              onChange={(event) => {
                setStrokeSize(clampStrokeSize(Number.parseFloat(event.target.value)));
              }}
            />
            <div className="toolbar-field-label toolbar-effect-label">
              Effective line: {effectiveInk.lineWidth.toFixed(1)} | Opacity{" "}
              {(effectiveInk.opacity * 100).toFixed(0)}%
            </div>
          </section>

          <section className="toolbar-section">
            <h3>Favorite Styles</h3>
            <div className="toolbar-action-row">
              <button type="button" className="toolbar-button" onClick={saveCurrentStyle}>
                Save Style
              </button>
            </div>
            <div className="style-list">
              {favoriteStyles.length ? (
                favoriteStyles.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="style-preset-button"
                    onClick={() => applyStyle(preset)}
                  >
                    <span className="style-preset-tool">{TOOL_LABELS[preset.tool]}</span>
                    <span className="style-preset-color" style={{ backgroundColor: preset.color }} />
                    <span className="style-preset-size">{preset.size.toFixed(1)}</span>
                  </button>
                ))
              ) : (
                <span className="toolbar-empty">No saved styles yet.</span>
              )}
            </div>
          </section>

          <section className="toolbar-section">
            <h3>Symbols</h3>
            <div className="tool-button-row symbol-button-row">
              {SYMBOL_OPTIONS.map((option) => {
                const isActive = option.value === activeSymbol;
                return (
                  <button
                    key={option.label}
                    type="button"
                    className={isActive ? "toolbar-button active" : "toolbar-button"}
                    onClick={() => {
                      setActiveSymbol(option.value);
                    }}
                    title={option.label}
                  >
                    {option.value || option.label}
                  </button>
                );
              })}
            </div>
            <span className="toolbar-empty">Tap the planner to place the selected symbol.</span>
          </section>

          <label className="toolbar-toggle">
            <input
              type="checkbox"
              checked={allowTouchInk}
              onChange={(event) => {
                setAllowTouchInk(event.target.checked);
              }}
            />
            Allow finger drawing
          </label>
        </aside>
      </div>
    </main>
  );
}
