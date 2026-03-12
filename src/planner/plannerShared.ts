/**
 * Shared types, constants, and utilities used across planner modules.
 * Single source of truth — import from here rather than duplicating.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type InkTipKind = "round" | "fine" | "fountain" | "marker" | "chisel";
export type InkShapeKind = "line" | "rectangle" | "ellipse" | "triangle";
export type DrawingTool = "pen" | "pencil" | "highlighter" | "shape";
export type InkTool =
  | DrawingTool
  | "eraser"
  | "bucket"
  | "lasso"
  | "elements"
  | "text"
  | "image"
  | "sticky";

export interface FavoriteStyle {
  id: string;
  tool: DrawingTool;
  color: string;
  size: number;
  tip: InkTipKind;
}

export interface SymbolOption {
  label: string;
  value: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const PLANNER_UNDO_EVENT = "planner-undo";
export const PLANNER_REDO_EVENT = "planner-redo";
export const ACTIVE_INK_PAGE_KEY = "__plannerActiveInkPageId";
export const ACTIVE_STAGE_TOUCH_COUNT_KEY = "__plannerActiveStageTouchCount";

// ─── Utilities ────────────────────────────────────────────────────────────────

export function normalizeInkTip(value: unknown): InkTipKind {
  if (value === "fine") return "fine";
  if (value === "fountain") return "fountain";
  if (value === "marker") return "marker";
  if (value === "chisel") return "chisel";
  return "round";
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function isDrawingTool(tool: InkTool): tool is DrawingTool {
  return (
    tool === "pen" ||
    tool === "pencil" ||
    tool === "highlighter" ||
    tool === "shape"
  );
}

export function clampStrokeSize(value: number): number {
  const DEFAULT = 2.1;
  if (!Number.isFinite(value)) return DEFAULT;
  return Math.min(Math.max(value, 0.8), 4.8);
}

export const TOOL_LABELS: Record<InkTool, string> = {
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

export const SYMBOL_OPTIONS: SymbolOption[] = [
  { label: "Draw", value: "" },
  { label: "Check", value: "✓" },
  { label: "Star", value: "★" },
  { label: "Bullet", value: "•" },
  { label: "Arrow", value: "→" },
  { label: "Heart", value: "♥" },
];

export const SHAPE_OPTIONS: Array<{ label: string; value: InkShapeKind }> = [
  { label: "Line", value: "line" },
  { label: "Rect", value: "rectangle" },
  { label: "Oval", value: "ellipse" },
  { label: "Tri", value: "triangle" },
];

export const TIP_OPTIONS: Array<{ value: InkTipKind; label: string }> = [
  { value: "round", label: "Round" },
  { value: "fine", label: "Fine" },
  { value: "fountain", label: "Fountain" },
  { value: "marker", label: "Marker" },
  { value: "chisel", label: "Chisel" },
];

export const DEFAULT_COLOR_PALETTE = [
  "#2f2b2a",
  "#1f3a64",
  "#0f6f67",
  "#0f8f43",
  "#a05f13",
  "#8d2525",
  "#7f3c9a",
  "#5f5f63",
];
