import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  normalizeInkTip,
  PLANNER_UNDO_EVENT,
  PLANNER_REDO_EVENT,
  ACTIVE_INK_PAGE_KEY,
  type InkTipKind,
  type InkShapeKind,
} from "./plannerShared";
export type { InkTipKind, InkShapeKind } from "./plannerShared";

export type InkInputType = "pen" | "touch" | "mouse" | "unknown";
export type InkLayerMode =
  | "draw"
  | "erase"
  | "bucket"
  | "shape"
  | "lasso"
  | "image"
  | "sticky";

interface InkLayerProps {
  pageId: string;
  allowTouch?: boolean;
  onInputType?: (inputType: InkInputType) => void;
  onStickyNoteCreated?: () => void;
  color?: string;
  lineWidth?: number;
  opacity?: number;
  symbol?: string | null;
  tipKind?: InkTipKind;
  lockToCells?: boolean;
  mode?: InkLayerMode;
  shapeKind?: InkShapeKind;
  imageSrc?: string | null;
  eraseRadius?: number;
}

interface InkPoint {
  x: number;
  y: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
  twist?: number;
  tangentialPressure?: number;
  timestamp?: number;
}

interface InkClipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InkStroke {
  color: string;
  width: number;
  opacity: number;
  tip?: InkTipKind;
  points: InkPoint[];
  clipRect?: InkClipRect | null;
  stickyId?: string;
}

interface InkSymbol {
  x: number;
  y: number;
  symbol: string;
  color: string;
  size: number;
  opacity: number;
  clipRect?: InkClipRect | null;
  stickyId?: string;
}

interface InkImage {
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  opacity: number;
  clipRect?: InkClipRect | null;
  stickyId?: string;
}

interface InkFill {
  id: string;
  rect: InkClipRect;
  color: string;
  opacity: number;
  points?: InkPoint[];
  clipRect?: InkClipRect | null;
  stickyId?: string;
}

interface InkSticky {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  color?: string;
}

interface InkDocument {
  strokes: InkStroke[];
  symbols: InkSymbol[];
  images: InkImage[];
  fills: InkFill[];
  stickies: InkSticky[];
}

interface ActiveStroke {
  pointerId: number;
  stroke: InkStroke;
  lastMoveTime: number;
}

interface ActiveShape {
  pointerId: number;
  start: InkPoint;
  current: InkPoint;
  tip: InkTipKind;
  clipRect?: InkClipRect | null;
  stickyId?: string;
}

interface ActiveLasso {
  pointerId: number;
  points: InkPoint[];
}

interface ActiveStickyDrag {
  id: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
}

interface LassoSelection {
  strokeIndexes: number[];
  symbolIndexes: number[];
  imageIndexes: number[];
  fillIndexes: number[];
  bounds: InkClipRect;
}

interface PointerLikeEvent {
  pointerId: number;
  pointerType: InkInputType;
  isStylus: boolean;
  clientX: number;
  clientY: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  altitudeAngle?: number;
  azimuthAngle?: number;
  twist?: number;
  tangentialPressure?: number;
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
}

interface SurfaceMetrics {
  rect: DOMRect;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
}

const STORAGE_PREFIX = "planner-ink-v1";
const CELL_SELECTOR = "[data-ink-cell]";
const DEFAULT_STICKY_WIDTH = 180;
const DEFAULT_STICKY_HEIGHT = 134;
const COLLAPSED_STICKY_SIZE = 30;
const BUCKET_FILL_OPACITY = 0.28;
const DEFAULT_STICKY_COLOR = "#faefb5";
const MAX_HISTORY_DEPTH = 160;

interface PlannerHistoryEventDetail {
  targetPageId: string | null;
}

function normalizeInputType(pointerType: string): InkInputType {
  if (pointerType === "pen" || pointerType === "touch" || pointerType === "mouse") {
    return pointerType;
  }
  return "unknown";
}

function tipWidthMultiplier(tip: InkTipKind): number {
  if (tip === "fine") {
    return 0.74;
  }
  if (tip === "fountain") {
    return 1.08;
  }
  if (tip === "marker") {
    return 1.35;
  }
  if (tip === "chisel") {
    return 1.22;
  }
  return 1;
}

/**
 * Maps raw pressure (0–1) to a rendered width factor for each tip.
 * Ease-in curve (Math.pow(..., 0.65)) ensures light touches are noticeably
 * finer while firm strokes bloom naturally — much more natural than linear.
 */
function tipPressureFactor(tip: InkTipKind, pressure: number): number {
  if (tip === "fine") {
    // Tight range: stays thin even under pressure.
    return 0.44 + Math.pow(pressure, 0.7) * 0.58;
  }
  if (tip === "fountain") {
    // Wide dynamic range: feather-light → bold; taper applied separately in redraw.
    return 0.18 + Math.pow(pressure, 0.55) * 1.55;
  }
  if (tip === "marker") {
    // Flat: marker width doesn't vary with pressure.
    return 1;
  }
  if (tip === "chisel") {
    // Slight variation; geometry (tilt) matters more than pressure.
    return 0.82 + Math.pow(pressure, 0.8) * 0.28;
  }
  // round — ease-in: faint touch → noticeably fine, firm press → blooms.
  return Math.pow(pressure, 0.65);
}

function tipLineCap(tip: InkTipKind): CanvasLineCap {
  if (tip === "marker") {
    return "square";
  }
  if (tip === "chisel") {
    return "butt";
  }
  return "round";
}

function tipLineJoin(tip: InkTipKind): CanvasLineJoin {
  if (tip === "chisel") {
    return "bevel";
  }
  return "round";
}

function normalizeAngle(value: number | undefined): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return value as number;
}

function normalizedTiltAmount(point: InkPoint): number {
  const altitude = normalizeAngle(point.altitudeAngle);
  if (altitude !== null) {
    const normalizedAltitude = clampNumber(altitude / (Math.PI / 2), 0, 1);
    return 1 - normalizedAltitude;
  }

  const tiltX = Number.isFinite(point.tiltX) ? Math.abs(point.tiltX ?? 0) : 0;
  const tiltY = Number.isFinite(point.tiltY) ? Math.abs(point.tiltY ?? 0) : 0;
  const tiltMagnitude = Math.hypot(tiltX, tiltY);
  return clampNumber(tiltMagnitude / 90, 0, 1);
}

function segmentTiltAmount(previousPoint: InkPoint, currentPoint: InkPoint): number {
  return (normalizedTiltAmount(previousPoint) + normalizedTiltAmount(currentPoint)) / 2;
}

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
    return 1 + tilt * 0.16;
  }

  if (tip === "fountain") {
    return 1 + tilt * 0.22;
  }

  if (tip === "marker") {
    return 1 + tilt * 0.30;
  }

  if (tip === "chisel") {
    return 1 + tilt * 0.44;
  }

  return 1 + tilt * 0.24;
}

function strokeSegmentWidth(
  stroke: InkStroke,
  pressure: number,
  previousPoint?: InkPoint,
  currentPoint?: InkPoint,
): number {
  const tip = normalizeInkTip(stroke.tip);
  const baseWidth = stroke.width * tipWidthMultiplier(tip) * tipPressureFactor(tip, pressure);
  if (!previousPoint || !currentPoint) {
    return baseWidth;
  }
  return baseWidth * tipTiltFactor(tip, previousPoint, currentPoint);
}

function normalizeStrokeTip<T extends { tip?: InkTipKind }>(stroke: T): T {
  return {
    ...stroke,
    tip: normalizeInkTip(stroke.tip),
  };
}

function isLikelyStylusPointer(event: PointerEvent): boolean {
  const pointerWithTouchType = event as PointerEvent & { touchType?: string };
  if (event.pointerType === "pen" || pointerWithTouchType.touchType === "stylus") {
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

function shouldSuppressSystemTouchUi(target: EventTarget | null): boolean {
  const element = getEventTargetElement(target);
  if (!element) {
    return true;
  }

  const interactiveControl = element.closest(
    "button, a, input, select, label, textarea, [role='button']",
  );
  return interactiveControl === null;
}

function storageKey(pageId: string): string {
  return `${STORAGE_PREFIX}:${pageId}`;
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function normalizeStickyColor(value: string | undefined): string {
  if (!value) {
    return DEFAULT_STICKY_COLOR;
  }
  const normalized = value.toLowerCase();
  if (isHexColor(normalized)) {
    return normalized;
  }
  return DEFAULT_STICKY_COLOR;
}

function parseHexColor(
  hex: string,
): { r: number; g: number; b: number } | null {
  if (!isHexColor(hex)) {
    return null;
  }
  const clean = hex.slice(1);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return { r, g, b };
}

function toHexChannel(value: number): string {
  return Math.round(Math.min(255, Math.max(0, value)))
    .toString(16)
    .padStart(2, "0");
}

function adjustHexColor(hex: string, delta: number): string {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    return hex;
  }

  const transform = (channel: number) => {
    if (delta >= 0) {
      return channel + (255 - channel) * delta;
    }
    return channel * (1 + delta);
  };

  const r = transform(rgb.r);
  const g = transform(rgb.g);
  const b = transform(rgb.b);
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

function stickyTextColor(hex: string): string {
  const rgb = parseHexColor(hex);
  if (!rgb) {
    return "#2f2b2a";
  }
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.62 ? "#2f2b2a" : "#f8f6f3";
}

function stickyStyleVars(sticky: InkSticky): CSSProperties {
  const base = normalizeStickyColor(sticky.color);
  return {
    "--sticky-fill": base,
    "--sticky-header": adjustHexColor(base, 0.1),
    "--sticky-border": adjustHexColor(base, -0.28),
    "--sticky-action-bg": adjustHexColor(base, 0.25),
    "--sticky-action-border": adjustHexColor(base, -0.22),
    "--sticky-action-text": stickyTextColor(adjustHexColor(base, -0.42)),
    "--sticky-text": stickyTextColor(base),
    "--sticky-shadow": "0 7px 16px rgba(35, 27, 12, 0.25)",
  } as CSSProperties;
}

function stickyRect(sticky: InkSticky): InkClipRect {
  return {
    x: sticky.x,
    y: sticky.y,
    width: sticky.width,
    height: sticky.height,
  };
}

function pointInRect(point: InkPoint, rect: InkClipRect): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function clampPressure(pressure: number): number {
  if (!Number.isFinite(pressure) || pressure <= 0) {
    return 1;
  }
  return Math.min(Math.max(pressure, 0.15), 2);
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(value, 0.05), 1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getSurfaceMetrics(element: HTMLElement): SurfaceMetrics {
  const rect = element.getBoundingClientRect();
  const baseWidth =
    element.offsetWidth || element.clientWidth || Math.max(1, rect.width);
  const baseHeight =
    element.offsetHeight || element.clientHeight || Math.max(1, rect.height);
  const width = Math.max(1, baseWidth);
  const height = Math.max(1, baseHeight);
  const scaleX = rect.width > 0 ? rect.width / width : 1;
  const scaleY = rect.height > 0 ? rect.height / height : 1;

  return {
    rect,
    width,
    height,
    scaleX: Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
    scaleY: Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1,
  };
}

function getCanvasHostMetrics(canvas: HTMLCanvasElement): SurfaceMetrics {
  const host = canvas.closest<HTMLElement>(".planner-paper");
  if (host) {
    return getSurfaceMetrics(host);
  }
  return getSurfaceMetrics(canvas);
}

function getRelativePoint(
  event: PointerLikeEvent,
  metrics: SurfaceMetrics,
): InkPoint {
  const x = (event.clientX - metrics.rect.left) / metrics.scaleX;
  const y = (event.clientY - metrics.rect.top) / metrics.scaleY;
  const pressure = clampPressure(event.pressure);

  return {
    x: clampNumber(x, 0, metrics.width),
    y: clampNumber(y, 0, metrics.height),
    pressure,
    tiltX: Number.isFinite(event.tiltX) ? event.tiltX : 0,
    tiltY: Number.isFinite(event.tiltY) ? event.tiltY : 0,
    altitudeAngle: normalizeAngle(event.altitudeAngle) ?? undefined,
    azimuthAngle: normalizeAngle(event.azimuthAngle) ?? undefined,
    twist: Number.isFinite(event.twist) ? event.twist : undefined,
    tangentialPressure: Number.isFinite(event.tangentialPressure)
      ? event.tangentialPressure
      : undefined,
    timestamp: Date.now(),
  };
}

function clampRectToSurface(
  rect: DOMRect,
  surfaceRect: DOMRect,
  scaleX = 1,
  scaleY = 1,
): InkClipRect | null {
  const safeScaleX = scaleX > 0 ? scaleX : 1;
  const safeScaleY = scaleY > 0 ? scaleY : 1;
  const surfaceWidth = surfaceRect.width / safeScaleX;
  const surfaceHeight = surfaceRect.height / safeScaleY;

  const left = Math.max(0, (rect.left - surfaceRect.left) / safeScaleX);
  const top = Math.max(0, (rect.top - surfaceRect.top) / safeScaleY);
  const right = Math.min(
    surfaceWidth,
    (rect.right - surfaceRect.left) / safeScaleX,
  );
  const bottom = Math.min(
    surfaceHeight,
    (rect.bottom - surfaceRect.top) / safeScaleY,
  );

  if (right <= left || bottom <= top) {
    return null;
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function getCellClipRect(
  event: PointerLikeEvent,
  surface: HTMLElement,
): InkClipRect | null {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const cell = target.closest<HTMLElement>(CELL_SELECTOR);
  if (!cell || !surface.contains(cell)) {
    return null;
  }

  const metrics = getSurfaceMetrics(surface);
  return clampRectToSurface(
    cell.getBoundingClientRect(),
    metrics.rect,
    metrics.scaleX,
    metrics.scaleY,
  );
}

function parseStoredInk(raw: string): InkDocument {
  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    return {
      strokes: parsed as InkStroke[],
      symbols: [],
      images: [],
      fills: [],
      stickies: [],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { strokes: [], symbols: [], images: [], fills: [], stickies: [] };
  }

  const maybeDocument = parsed as Partial<InkDocument>;
  return {
    strokes: Array.isArray(maybeDocument.strokes) ? maybeDocument.strokes : [],
    symbols: Array.isArray(maybeDocument.symbols) ? maybeDocument.symbols : [],
    images: Array.isArray(maybeDocument.images) ? maybeDocument.images : [],
    fills: Array.isArray(maybeDocument.fills) ? maybeDocument.fills : [],
    stickies: Array.isArray(maybeDocument.stickies)
      ? maybeDocument.stickies
      : [],
  };
}

function cloneInkDocument(document: InkDocument): InkDocument {
  return JSON.parse(JSON.stringify(document)) as InkDocument;
}

function normalizeClipToSticky<T extends { stickyId?: string; clipRect?: InkClipRect | null }>(
  entry: T,
): T {
  if (entry.stickyId) {
    return entry;
  }
  return {
    ...entry,
    clipRect: null,
  };
}

function clampStickyToCanvas(
  sticky: InkSticky,
  canvasWidth: number,
  canvasHeight: number,
): InkSticky {
  const maxX = Math.max(0, canvasWidth - sticky.width);
  const maxY = Math.max(0, canvasHeight - sticky.height);
  return {
    ...sticky,
    x: Math.min(Math.max(0, sticky.x), maxX),
    y: Math.min(Math.max(0, sticky.y), maxY),
  };
}

function rectMatches(a: InkClipRect, b: InkClipRect, tolerance = 1): boolean {
  return (
    Math.abs(a.x - b.x) <= tolerance &&
    Math.abs(a.y - b.y) <= tolerance &&
    Math.abs(a.width - b.width) <= tolerance &&
    Math.abs(a.height - b.height) <= tolerance
  );
}

function polygonBounds(points: InkPoint[]): InkClipRect | null {
  if (!points.length) {
    return null;
  }

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function pointInPolygon(point: InkPoint, polygon: InkPoint[]): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];

    const intersects =
      (pi.y > point.y) !== (pj.y > point.y) &&
      point.x <
        ((pj.x - pi.x) * (point.y - pi.y)) /
          (pj.y - pi.y + Number.EPSILON) +
          pi.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function crossProduct(a: InkPoint, b: InkPoint, c: InkPoint): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function pointOnSegment(a: InkPoint, b: InkPoint, p: InkPoint): boolean {
  const minX = Math.min(a.x, b.x) - 0.0001;
  const maxX = Math.max(a.x, b.x) + 0.0001;
  const minY = Math.min(a.y, b.y) - 0.0001;
  const maxY = Math.max(a.y, b.y) + 0.0001;
  return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
}

function segmentsIntersect(
  a1: InkPoint,
  a2: InkPoint,
  b1: InkPoint,
  b2: InkPoint,
): boolean {
  const d1 = crossProduct(a1, a2, b1);
  const d2 = crossProduct(a1, a2, b2);
  const d3 = crossProduct(b1, b2, a1);
  const d4 = crossProduct(b1, b2, a2);

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }

  if (Math.abs(d1) < 0.0001 && pointOnSegment(a1, a2, b1)) {
    return true;
  }
  if (Math.abs(d2) < 0.0001 && pointOnSegment(a1, a2, b2)) {
    return true;
  }
  if (Math.abs(d3) < 0.0001 && pointOnSegment(b1, b2, a1)) {
    return true;
  }
  if (Math.abs(d4) < 0.0001 && pointOnSegment(b1, b2, a2)) {
    return true;
  }

  return false;
}

function segmentIntersectsPolygon(
  start: InkPoint,
  end: InkPoint,
  polygon: InkPoint[],
): boolean {
  if (pointInPolygon(start, polygon) || pointInPolygon(end, polygon)) {
    return true;
  }

  for (let i = 0; i < polygon.length; i += 1) {
    const edgeStart = polygon[i];
    const edgeEnd = polygon[(i + 1) % polygon.length];
    if (segmentsIntersect(start, end, edgeStart, edgeEnd)) {
      return true;
    }
  }

  return false;
}

function drawWithClip(
  ctx: CanvasRenderingContext2D,
  clipRect: InkClipRect | null | undefined,
  draw: () => void,
) {
  if (!clipRect) {
    draw();
    return;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
  ctx.clip();
  draw();
  ctx.restore();
}

function isPointInsideRadius(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radius: number,
): boolean {
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  return deltaX * deltaX + deltaY * deltaY <= radius * radius;
}

function distancePointToSegment(
  point: InkPoint,
  start: InkPoint,
  end: InkPoint,
): number {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSq < 0.0001) {
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  let t =
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) /
    segmentLengthSq;
  t = Math.max(0, Math.min(1, t));

  const projectionX = start.x + t * segmentX;
  const projectionY = start.y + t * segmentY;
  const dx = point.x - projectionX;
  const dy = point.y - projectionY;
  return Math.sqrt(dx * dx + dy * dy);
}

function eraseStrokeAtPoint(
  stroke: InkStroke,
  point: InkPoint,
  radius: number,
): InkStroke[] {
  if (!stroke.points.length) {
    return [];
  }

  if (stroke.points.length === 1) {
    const single = stroke.points[0];
    if (isPointInsideRadius(single.x, single.y, point.x, point.y, radius)) {
      return [];
    }
    return [stroke];
  }

  const erased = new Array<boolean>(stroke.points.length).fill(false);

  for (let i = 0; i < stroke.points.length; i += 1) {
    const candidate = stroke.points[i];
    if (isPointInsideRadius(candidate.x, candidate.y, point.x, point.y, radius)) {
      erased[i] = true;
    }
  }

  for (let i = 0; i < stroke.points.length - 1; i += 1) {
    const start = stroke.points[i];
    const end = stroke.points[i + 1];
    if (distancePointToSegment(point, start, end) <= radius) {
      erased[i] = true;
      erased[i + 1] = true;
    }
  }

  const splitStrokes: InkStroke[] = [];
  let currentChunk: InkPoint[] = [];

  for (let i = 0; i < stroke.points.length; i += 1) {
    if (erased[i]) {
      if (currentChunk.length > 0) {
        splitStrokes.push({
          ...stroke,
          points: currentChunk,
        });
      }
      currentChunk = [];
      continue;
    }

    currentChunk = [...currentChunk, stroke.points[i]];
  }

  if (currentChunk.length > 0) {
    splitStrokes.push({
      ...stroke,
      points: currentChunk,
    });
  }

  return splitStrokes;
}

function makeRectFromPoints(start: InkPoint, end: InkPoint): InkClipRect {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function rectContainsPoint(rect: InkClipRect, point: InkPoint): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

function rectsIntersect(a: InkClipRect, b: InkClipRect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function strokeBounds(stroke: InkStroke): InkClipRect | null {
  if (!stroke.points.length) {
    return null;
  }

  let minX = stroke.points[0].x;
  let maxX = stroke.points[0].x;
  let minY = stroke.points[0].y;
  let maxY = stroke.points[0].y;

  for (let i = 1; i < stroke.points.length; i += 1) {
    const point = stroke.points[i];
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const extra = Math.max(4, stroke.width * 0.8);
  return {
    x: minX - extra,
    y: minY - extra,
    width: maxX - minX + extra * 2,
    height: maxY - minY + extra * 2,
  };
}

function symbolBounds(symbol: InkSymbol): InkClipRect {
  const radius = Math.max(8, symbol.size * 0.8);
  return {
    x: symbol.x - radius,
    y: symbol.y - radius,
    width: radius * 2,
    height: radius * 2,
  };
}

function imageBounds(image: InkImage): InkClipRect {
  return {
    x: image.x,
    y: image.y,
    width: image.width,
    height: image.height,
  };
}

function fillBounds(fill: InkFill): InkClipRect {
  if (fill.points && fill.points.length >= 3) {
    return polygonBounds(fill.points) ?? fill.rect;
  }
  return fill.rect;
}

function isClosedStrokePath(stroke: InkStroke): boolean {
  if (stroke.points.length < 3) {
    return false;
  }

  const first = stroke.points[0];
  const last = stroke.points[stroke.points.length - 1];
  const dx = first.x - last.x;
  const dy = first.y - last.y;
  const closeThreshold = Math.max(8, stroke.width * 1.8);
  return dx * dx + dy * dy <= closeThreshold * closeThreshold;
}

function strokeContainsPointForFill(stroke: InkStroke, point: InkPoint): boolean {
  if (stroke.clipRect && !pointInRect(point, stroke.clipRect)) {
    return false;
  }

  if (!isClosedStrokePath(stroke)) {
    return false;
  }

  return pointInPolygon(point, stroke.points);
}

function findBucketTargetStroke(
  strokes: InkStroke[],
  point: InkPoint,
  stickyId?: string,
): InkStroke | null {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    const candidate = strokes[index];
    if (stickyId && candidate.stickyId !== stickyId) {
      continue;
    }

    if (!stickyId && candidate.stickyId) {
      continue;
    }

    if (strokeContainsPointForFill(candidate, point)) {
      return candidate;
    }
  }

  return null;
}

function fillPathMatches(
  existing: InkFill,
  nextFillBounds: InkClipRect,
  stickyId?: string,
): boolean {
  if (!existing.points || !rectMatches(existing.rect, nextFillBounds)) {
    return false;
  }
  return existing.stickyId === stickyId;
}

function rectIntersectsPolygon(rect: InkClipRect, polygon: InkPoint[]): boolean {
  const corners: InkPoint[] = [
    { x: rect.x, y: rect.y, pressure: 1 },
    { x: rect.x + rect.width, y: rect.y, pressure: 1 },
    { x: rect.x + rect.width, y: rect.y + rect.height, pressure: 1 },
    { x: rect.x, y: rect.y + rect.height, pressure: 1 },
  ];

  for (const corner of corners) {
    if (pointInPolygon(corner, polygon)) {
      return true;
    }
  }

  for (const polygonPoint of polygon) {
    if (rectContainsPoint(rect, polygonPoint)) {
      return true;
    }
  }

  for (let i = 0; i < corners.length; i += 1) {
    const rectStart = corners[i];
    const rectEnd = corners[(i + 1) % corners.length];
    if (segmentIntersectsPolygon(rectStart, rectEnd, polygon)) {
      return true;
    }
  }

  return false;
}

function strokeIntersectsPolygon(stroke: InkStroke, polygon: InkPoint[]): boolean {
  if (!stroke.points.length) {
    return false;
  }

  for (const point of stroke.points) {
    if (pointInPolygon(point, polygon)) {
      return true;
    }
  }

  for (let i = 1; i < stroke.points.length; i += 1) {
    if (segmentIntersectsPolygon(stroke.points[i - 1], stroke.points[i], polygon)) {
      return true;
    }
  }

  return false;
}

function combineRects(rects: InkClipRect[]): InkClipRect | null {
  if (!rects.length) {
    return null;
  }

  let left = rects[0].x;
  let top = rects[0].y;
  let right = rects[0].x + rects[0].width;
  let bottom = rects[0].y + rects[0].height;

  for (let i = 1; i < rects.length; i += 1) {
    const rect = rects[i];
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function shapeStrokeFromPoints(
  kind: InkShapeKind,
  start: InkPoint,
  end: InkPoint,
  color: string,
  width: number,
  opacity: number,
  clipRect?: InkClipRect | null,
  tip: InkTipKind = "round",
): InkStroke {
  if (kind === "line") {
    return {
      color,
      width,
      opacity,
      tip,
      points: [start, end],
      clipRect,
    };
  }

  if (kind === "rectangle") {
    const rect = makeRectFromPoints(start, end);
    const topLeft: InkPoint = { x: rect.x, y: rect.y, pressure: 1 };
    const topRight: InkPoint = { x: rect.x + rect.width, y: rect.y, pressure: 1 };
    const bottomRight: InkPoint = {
      x: rect.x + rect.width,
      y: rect.y + rect.height,
      pressure: 1,
    };
    const bottomLeft: InkPoint = { x: rect.x, y: rect.y + rect.height, pressure: 1 };
    return {
      color,
      width,
      opacity,
      tip,
      points: [topLeft, topRight, bottomRight, bottomLeft, topLeft],
      clipRect,
    };
  }

  if (kind === "triangle") {
    const rect = makeRectFromPoints(start, end);
    const top: InkPoint = {
      x: rect.x + rect.width / 2,
      y: rect.y,
      pressure: 1,
    };
    const bottomRight: InkPoint = {
      x: rect.x + rect.width,
      y: rect.y + rect.height,
      pressure: 1,
    };
    const bottomLeft: InkPoint = {
      x: rect.x,
      y: rect.y + rect.height,
      pressure: 1,
    };

    return {
      color,
      width,
      opacity,
      tip,
      points: [top, bottomRight, bottomLeft, top],
      clipRect,
    };
  }

  const rect = makeRectFromPoints(start, end);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = Math.max(rect.width / 2, 2);
  const ry = Math.max(rect.height / 2, 2);
  const steps = 36;
  const points: InkPoint[] = [];

  for (let i = 0; i <= steps; i += 1) {
    const angle = (Math.PI * 2 * i) / steps;
    points.push({
      x: cx + Math.cos(angle) * rx,
      y: cy + Math.sin(angle) * ry,
      pressure: 1,
    });
  }

  return {
    color,
    width,
    opacity,
    tip,
    points,
    clipRect,
  };
}

export default function InkLayer({
  pageId,
  allowTouch = false,
  onInputType,
  onStickyNoteCreated,
  color = "#2f2b2a",
  lineWidth = 1.7,
  opacity = 1,
  symbol = null,
  tipKind = "round",
  lockToCells = false,
  mode = "draw",
  shapeKind = "line",
  imageSrc = null,
  eraseRadius = 14,
}: InkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<InkStroke[]>([]);
  const symbolsRef = useRef<InkSymbol[]>([]);
  const imagesRef = useRef<InkImage[]>([]);
  const fillsRef = useRef<InkFill[]>([]);
  const stickiesRef = useRef<InkSticky[]>([]);
  const [stickyNotes, setStickyNotes] = useState<InkSticky[]>([]);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const activeEraserPointerIdRef = useRef<number | null>(null);
  const activeShapeRef = useRef<ActiveShape | null>(null);
  const activeLassoRef = useRef<ActiveLasso | null>(null);
  const activeLassoDragRef = useRef<{ pointerId: number; lastPoint: InkPoint } | null>(
    null,
  );
  const activeStickyDragRef = useRef<ActiveStickyDrag | null>(null);
  const lassoSelectionRef = useRef<LassoSelection | null>(null);
  const redrawRef = useRef<(() => void) | null>(null);
  const dprRef = useRef(1);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pointerFromTouchIdRef = useRef<Map<number, number>>(new Map());
  const touchStylusByPointerIdRef = useRef<Map<number, boolean>>(new Map());
  const stylusPointerIdsRef = useRef<Set<number>>(new Set());
  // Pointer IDs waiting for their first pointermove before setPointerCapture is
  // called. Deferring capture avoids a WKWebView/iOS bug where calling
  // setPointerCapture immediately inside pointerdown triggers pointercancel.
  const pendingCapturePtrRef = useRef<Set<number>>(new Set());
  const nextTouchPointerIdRef = useRef<number>(40000);
  const undoStackRef = useRef<InkDocument[]>([]);
  const redoStackRef = useRef<InkDocument[]>([]);
  const didSnapshotDuringDragRef = useRef<boolean>(false);
  const runtimeConfigRef = useRef({
    allowTouch,
    onInputType,
    onStickyNoteCreated,
    color,
    lineWidth,
    opacity,
    symbol,
    tipKind,
    lockToCells,
    mode,
    shapeKind,
    imageSrc,
    eraseRadius,
  });

  useEffect(() => {
    runtimeConfigRef.current = {
      allowTouch,
      onInputType,
      onStickyNoteCreated,
      color,
      lineWidth,
      opacity,
      symbol,
      tipKind,
      lockToCells,
      mode,
      shapeKind,
      imageSrc,
      eraseRadius,
    };
  }, [
    allowTouch,
    color,
    eraseRadius,
    imageSrc,
    lineWidth,
    lockToCells,
    mode,
    onInputType,
    onStickyNoteCreated,
    opacity,
    shapeKind,
    symbol,
    tipKind,
  ]);

  const persistInk = useCallback(() => {
    try {
      const payload: InkDocument = {
        strokes: strokesRef.current,
        symbols: symbolsRef.current,
        images: imagesRef.current,
        fills: fillsRef.current,
        stickies: stickiesRef.current,
      };
      localStorage.setItem(storageKey(pageId), JSON.stringify(payload));
    } catch {
      // Ignore storage failures (private mode / quota).
    }
  }, [pageId]);

  const updateStickyCollection = useCallback(
    (nextStickies: InkSticky[]) => {
      stickiesRef.current = nextStickies;
      setStickyNotes(nextStickies);
      persistInk();
    },
    [persistInk],
  );

  const captureDocumentSnapshot = useCallback((): InkDocument => {
    return cloneInkDocument({
      strokes: strokesRef.current,
      symbols: symbolsRef.current,
      images: imagesRef.current,
      fills: fillsRef.current,
      stickies: stickiesRef.current,
    });
  }, []);

  const restoreDocumentSnapshot = useCallback(
    (snapshot: InkDocument) => {
      strokesRef.current = snapshot.strokes;
      symbolsRef.current = snapshot.symbols;
      imagesRef.current = snapshot.images;
      fillsRef.current = snapshot.fills;
      stickiesRef.current = snapshot.stickies;
      setStickyNotes(snapshot.stickies);
      persistInk();
      redrawRef.current?.();
    },
    [persistInk],
  );

  const captureUndoSnapshot = useCallback(() => {
    const nextSnapshot = captureDocumentSnapshot();
    undoStackRef.current = [...undoStackRef.current, nextSnapshot].slice(
      -MAX_HISTORY_DEPTH,
    );
    redoStackRef.current = [];
  }, [captureDocumentSnapshot]);

  const setActiveInkPage = useCallback(() => {
    const plannerWindow = window as Window & { __plannerActiveInkPageId?: string };
    plannerWindow[ACTIVE_INK_PAGE_KEY] = pageId;
  }, [pageId]);

  const handleUndo = useCallback(() => {
    const previous = undoStackRef.current[undoStackRef.current.length - 1];
    if (!previous) {
      return;
    }

    const currentSnapshot = captureDocumentSnapshot();
    undoStackRef.current = undoStackRef.current.slice(
      0,
      undoStackRef.current.length - 1,
    );
    redoStackRef.current = [...redoStackRef.current, currentSnapshot].slice(
      -MAX_HISTORY_DEPTH,
    );
    restoreDocumentSnapshot(previous);
  }, [captureDocumentSnapshot, restoreDocumentSnapshot]);

  const handleRedo = useCallback(() => {
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    if (!next) {
      return;
    }

    const currentSnapshot = captureDocumentSnapshot();
    redoStackRef.current = redoStackRef.current.slice(
      0,
      redoStackRef.current.length - 1,
    );
    undoStackRef.current = [...undoStackRef.current, currentSnapshot].slice(
      -MAX_HISTORY_DEPTH,
    );
    restoreDocumentSnapshot(next);
  }, [captureDocumentSnapshot, restoreDocumentSnapshot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas?.closest<HTMLElement>(".planner-paper");
    if (!canvas || !surface) {
      return;
    }
    let canceled = false;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const getOrCreateImage = (src: string) => {
      const cached = imageCacheRef.current.get(src);
      if (cached) {
        return cached;
      }

      const image = new Image();
      image.onload = () => {
        redraw();
      };
      image.src = src;
      imageCacheRef.current.set(src, image);
      return image;
    };

    const redraw = () => {
      const metrics = getCanvasHostMetrics(canvas);
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      ctx.clearRect(0, 0, metrics.width, metrics.height);

      const collapsedNotes = stickiesRef.current.filter((s) => s.collapsed);
      const hasCollapsed = collapsedNotes.length > 0;
      if (hasCollapsed) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, metrics.width, metrics.height);
        for (const note of collapsedNotes) {
          ctx.rect(note.x, note.y, note.width, note.height);
        }
        ctx.clip("evenodd");
      }

      for (const fill of fillsRef.current) {
        drawWithClip(ctx, fill.clipRect, () => {
          ctx.fillStyle = fill.color;
          ctx.globalAlpha = clampOpacity(fill.opacity);
          if (fill.points && fill.points.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(fill.points[0].x, fill.points[0].y);
            for (let index = 1; index < fill.points.length; index += 1) {
              ctx.lineTo(fill.points[index].x, fill.points[index].y);
            }
            ctx.closePath();
            ctx.fill();
          } else {
            ctx.fillRect(fill.rect.x, fill.rect.y, fill.rect.width, fill.rect.height);
          }
          ctx.globalAlpha = 1;
        });
      }

      for (const imageItem of imagesRef.current) {
        drawWithClip(ctx, imageItem.clipRect, () => {
          const loadedImage = getOrCreateImage(imageItem.src);
          ctx.globalAlpha = clampOpacity(imageItem.opacity);
          if (loadedImage.complete && loadedImage.naturalWidth > 0) {
            ctx.drawImage(
              loadedImage,
              imageItem.x,
              imageItem.y,
              imageItem.width,
              imageItem.height,
            );
          } else {
            ctx.fillStyle = "rgba(198, 190, 184, 0.35)";
            ctx.fillRect(
              imageItem.x,
              imageItem.y,
              imageItem.width,
              imageItem.height,
            );
            ctx.strokeStyle = "rgba(130, 121, 113, 0.75)";
            ctx.strokeRect(
              imageItem.x,
              imageItem.y,
              imageItem.width,
              imageItem.height,
            );
          }
          ctx.globalAlpha = 1;
        });
      }

      for (const stroke of strokesRef.current) {
        if (!stroke.points.length) {
          continue;
        }

        drawWithClip(ctx, stroke.clipRect, () => {
          const normalizedTip = normalizeInkTip(stroke.tip);
          ctx.strokeStyle = stroke.color;
          ctx.fillStyle = stroke.color;
          ctx.lineCap = tipLineCap(normalizedTip);
          ctx.lineJoin = tipLineJoin(normalizedTip);
          ctx.globalAlpha = clampOpacity(stroke.opacity);

          if (stroke.points.length === 1) {
            const point = stroke.points[0];
            const pointRadius = Math.max(
              0.6,
              (strokeSegmentWidth(stroke, point.pressure) * 0.45),
            );
            ctx.beginPath();
            ctx.arc(point.x, point.y, pointRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            return;
          }

          // Smooth rendering: use quadratic bezier through midpoints so adjacent
          // segments share endpoints and join without visible kinks. Fountain tip
          // also tapers at stroke start/end for a natural calligraphy effect.
          const nPts = stroke.points.length;
          const smoothTip = normalizeInkTip(stroke.tip);
          for (let i = 1; i < nPts; i += 1) {
            const prevPoint = stroke.points[i - 1];
            const currPoint = stroke.points[i];
            const segmentPressure =
              (prevPoint.pressure + currPoint.pressure) / 2;

            // Fountain taper: fade in for first 20% of stroke, out for last 20%.
            let taperFactor = 1;
            if (smoothTip === "fountain" && nPts > 5) {
              const t = i / (nPts - 1);
              if (t < 0.2) taperFactor = 0.25 + (t / 0.2) * 0.75;
              else if (t > 0.8) taperFactor = 0.25 + ((1 - t) / 0.2) * 0.75;
            }

            ctx.lineWidth =
              strokeSegmentWidth(stroke, segmentPressure, prevPoint, currPoint) *
              taperFactor;

            // Midpoints are shared endpoints between consecutive segments → smooth.
            const prevPrevPoint = i >= 2 ? stroke.points[i - 2] : prevPoint;
            const startX =
              i >= 2 ? (prevPrevPoint.x + prevPoint.x) / 2 : prevPoint.x;
            const startY =
              i >= 2 ? (prevPrevPoint.y + prevPoint.y) / 2 : prevPoint.y;
            const isLast = i === nPts - 1;
            const endX = isLast ? currPoint.x : (prevPoint.x + currPoint.x) / 2;
            const endY = isLast ? currPoint.y : (prevPoint.y + currPoint.y) / 2;

            ctx.beginPath();
            if (i >= 2) {
              ctx.moveTo(startX, startY);
              ctx.quadraticCurveTo(prevPoint.x, prevPoint.y, endX, endY);
            } else {
              ctx.moveTo(startX, startY);
              ctx.lineTo(endX, endY);
            }
            ctx.stroke();
          }

          ctx.globalAlpha = 1;
        });
      }

      for (const currentSymbol of symbolsRef.current) {
        if (!currentSymbol.symbol) {
          continue;
        }

        drawWithClip(ctx, currentSymbol.clipRect, () => {
          ctx.fillStyle = currentSymbol.color;
          ctx.globalAlpha = clampOpacity(currentSymbol.opacity);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `${Math.max(10, currentSymbol.size)}px "DM Sans", "Avenir Next", "Segoe UI", sans-serif`;
          ctx.fillText(currentSymbol.symbol, currentSymbol.x, currentSymbol.y);
          ctx.globalAlpha = 1;
        });
      }

      const activeShape = activeShapeRef.current;
      if (activeShape) {
        const runtimeConfig = runtimeConfigRef.current;
        const previewStroke = shapeStrokeFromPoints(
          runtimeConfig.shapeKind,
          activeShape.start,
          activeShape.current,
          runtimeConfig.color,
          runtimeConfig.lineWidth,
          clampOpacity(runtimeConfig.opacity),
          activeShape.clipRect,
          activeShape.tip,
        );
        drawWithClip(ctx, previewStroke.clipRect, () => {
          const previewTip = normalizeInkTip(previewStroke.tip);
          ctx.strokeStyle = previewStroke.color;
          ctx.lineCap = tipLineCap(previewTip);
          ctx.lineJoin = tipLineJoin(previewTip);
          ctx.globalAlpha = previewStroke.opacity;
          ctx.lineWidth = strokeSegmentWidth(
            previewStroke,
            1,
            previewStroke.points[0],
            previewStroke.points[1],
          );

          ctx.beginPath();
          ctx.moveTo(previewStroke.points[0].x, previewStroke.points[0].y);
          for (let i = 1; i < previewStroke.points.length; i += 1) {
            ctx.lineTo(previewStroke.points[i].x, previewStroke.points[i].y);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        });
      }

      const activeLasso = activeLassoRef.current;
      if (activeLasso && activeLasso.points.length) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#6f625d";
        ctx.beginPath();
        ctx.moveTo(activeLasso.points[0].x, activeLasso.points[0].y);
        for (let i = 1; i < activeLasso.points.length; i += 1) {
          ctx.lineTo(activeLasso.points[i].x, activeLasso.points[i].y);
        }
        if (activeLasso.points.length >= 3) {
          ctx.closePath();
        }
        ctx.stroke();
        ctx.restore();
      }

      const selection = lassoSelectionRef.current;
      if (selection) {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = "#524740";
        ctx.strokeRect(
          selection.bounds.x,
          selection.bounds.y,
          selection.bounds.width,
          selection.bounds.height,
        );
        ctx.restore();
      }

      if (hasCollapsed) {
        ctx.restore();
      }
    };
    redrawRef.current = redraw;

    const resizeCanvas = () => {
      const metrics = getCanvasHostMetrics(canvas);
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      dprRef.current = dpr;

      canvas.width = Math.max(1, Math.floor(metrics.width * dpr));
      canvas.height = Math.max(1, Math.floor(metrics.height * dpr));
      canvas.style.width = `${metrics.width}px`;
      canvas.style.height = `${metrics.height}px`;

      redraw();
    };

    const clearDocumentSelection = () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        selection.removeAllRanges();
      }
    };

    const drawStrokeSegment = (stroke: InkStroke) => {
      if (stroke.points.length < 2) {
        return;
      }

      const previousPoint = stroke.points[stroke.points.length - 2];
      const currentPoint = stroke.points[stroke.points.length - 1];
      const segmentPressure = (previousPoint.pressure + currentPoint.pressure) / 2;

      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);

      drawWithClip(ctx, stroke.clipRect, () => {
        const normalizedTip = normalizeInkTip(stroke.tip);
        ctx.strokeStyle = stroke.color;
        ctx.lineCap = tipLineCap(normalizedTip);
        ctx.lineJoin = tipLineJoin(normalizedTip);
        ctx.globalAlpha = clampOpacity(stroke.opacity);
        ctx.lineWidth = strokeSegmentWidth(
          stroke,
          segmentPressure,
          previousPoint,
          currentPoint,
        );
        ctx.beginPath();
        ctx.moveTo(previousPoint.x, previousPoint.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    };

    const canDrawWithInput = (event: PointerLikeEvent) => {
      const isStylusLikeTouch = event.pointerType === "touch" && event.isStylus;

      if (
        event.pointerType === "touch" &&
        !isStylusLikeTouch &&
        stylusPointerIdsRef.current.size > 0
      ) {
        // Palm rejection: ignore non-stylus touches while any stylus contact is active.
        return false;
      }

      if (event.isStylus || isStylusLikeTouch) {
        return true;
      }
      return (
        event.pointerType === "pen" ||
        event.pointerType === "mouse" ||
        (runtimeConfigRef.current.allowTouch && event.pointerType === "touch")
      );
    };

    const maybeStopPropagation = (event: PointerLikeEvent) => {
      if (event.pointerType !== "touch") {
        event.stopPropagation();
      }
    };

    const eraseAtPoint = (point: InkPoint) => {
      const radius = Math.max(6, runtimeConfigRef.current.eraseRadius);
      const candidateStrokes: InkStroke[] = [];
      for (const stroke of strokesRef.current) {
        const remaining = eraseStrokeAtPoint(stroke, point, radius);
        candidateStrokes.push(...remaining);
      }

      const candidateSymbols = symbolsRef.current.filter(
        (currentSymbol) =>
          !isPointInsideRadius(currentSymbol.x, currentSymbol.y, point.x, point.y, radius),
      );

      const candidateImages = imagesRef.current.filter((currentImage) => {
        const bounds = imageBounds(currentImage);
        return !(
          point.x >= bounds.x - radius &&
          point.x <= bounds.x + bounds.width + radius &&
          point.y >= bounds.y - radius &&
          point.y <= bounds.y + bounds.height + radius
        );
      });

      const candidateFills = fillsRef.current.filter((fill) => {
        const bounds = fillBounds(fill);
        return !(
          point.x >= bounds.x - radius &&
          point.x <= bounds.x + bounds.width + radius &&
          point.y >= bounds.y - radius &&
          point.y <= bounds.y + bounds.height + radius
        );
      });

      const nextStickies = stickiesRef.current.filter((sticky) => {
        return !(
          point.x >= sticky.x - radius &&
          point.x <= sticky.x + sticky.width + radius &&
          point.y >= sticky.y - radius &&
          point.y <= sticky.y + sticky.height + radius
        );
      });
      const removedStickyIds = new Set(
        stickiesRef.current
          .filter((sticky) => !nextStickies.some((next) => next.id === sticky.id))
          .map((sticky) => sticky.id),
      );

      const nextStrokes = candidateStrokes.filter(
        (stroke) => !stroke.stickyId || !removedStickyIds.has(stroke.stickyId),
      );
      const nextSymbols = candidateSymbols.filter(
        (symbolValue) =>
          !symbolValue.stickyId || !removedStickyIds.has(symbolValue.stickyId),
      );
      const nextImages = candidateImages.filter(
        (imageValue) => !imageValue.stickyId || !removedStickyIds.has(imageValue.stickyId),
      );
      const nextFills = candidateFills.filter(
        (fillValue) => !fillValue.stickyId || !removedStickyIds.has(fillValue.stickyId),
      );

      if (
        nextStrokes.length !== strokesRef.current.length ||
        nextSymbols.length !== symbolsRef.current.length ||
        nextImages.length !== imagesRef.current.length ||
        nextFills.length !== fillsRef.current.length ||
        nextStickies.length !== stickiesRef.current.length
      ) {
        strokesRef.current = nextStrokes;
        symbolsRef.current = nextSymbols;
        imagesRef.current = nextImages;
        fillsRef.current = nextFills;
        stickiesRef.current = nextStickies;
        setStickyNotes(nextStickies);
        redraw();
      }
    };

    const computeLassoSelection = (polygon: InkPoint[]): LassoSelection | null => {
      const polygonRect = polygonBounds(polygon);
      if (!polygonRect) {
        return null;
      }

      const strokeIndexes: number[] = [];
      const symbolIndexes: number[] = [];
      const imageIndexes: number[] = [];
      const fillIndexes: number[] = [];
      const selectedBounds: InkClipRect[] = [];

      for (let i = 0; i < strokesRef.current.length; i += 1) {
        const bounds = strokeBounds(strokesRef.current[i]);
        if (!bounds || !rectsIntersect(polygonRect, bounds)) {
          continue;
        }
        if (!strokeIntersectsPolygon(strokesRef.current[i], polygon)) {
          continue;
        }
        strokeIndexes.push(i);
        selectedBounds.push(bounds);
      }

      for (let i = 0; i < symbolsRef.current.length; i += 1) {
        const bounds = symbolBounds(symbolsRef.current[i]);
        if (!rectsIntersect(polygonRect, bounds)) {
          continue;
        }
        if (!rectIntersectsPolygon(bounds, polygon)) {
          continue;
        }
        symbolIndexes.push(i);
        selectedBounds.push(bounds);
      }

      for (let i = 0; i < imagesRef.current.length; i += 1) {
        const bounds = imageBounds(imagesRef.current[i]);
        if (!rectsIntersect(polygonRect, bounds)) {
          continue;
        }
        if (!rectIntersectsPolygon(bounds, polygon)) {
          continue;
        }
        imageIndexes.push(i);
        selectedBounds.push(bounds);
      }

      for (let i = 0; i < fillsRef.current.length; i += 1) {
        const bounds = fillBounds(fillsRef.current[i]);
        if (!rectsIntersect(polygonRect, bounds)) {
          continue;
        }
        if (!rectIntersectsPolygon(bounds, polygon)) {
          continue;
        }
        fillIndexes.push(i);
        selectedBounds.push(bounds);
      }

      const bounds = combineRects(selectedBounds);
      if (!bounds) {
        return null;
      }

      return {
        strokeIndexes,
        symbolIndexes,
        imageIndexes,
        fillIndexes,
        bounds,
      };
    };

    const recomputeSelectionBounds = (selection: LassoSelection): InkClipRect | null => {
      const selectedBounds: InkClipRect[] = [];

      for (const index of selection.strokeIndexes) {
        const stroke = strokesRef.current[index];
        if (!stroke) {
          continue;
        }
        const bounds = strokeBounds(stroke);
        if (bounds) {
          selectedBounds.push(bounds);
        }
      }

      for (const index of selection.symbolIndexes) {
        const currentSymbol = symbolsRef.current[index];
        if (!currentSymbol) {
          continue;
        }
        selectedBounds.push(symbolBounds(currentSymbol));
      }

      for (const index of selection.imageIndexes) {
        const currentImage = imagesRef.current[index];
        if (!currentImage) {
          continue;
        }
        selectedBounds.push(imageBounds(currentImage));
      }

      for (const index of selection.fillIndexes) {
        const fill = fillsRef.current[index];
        if (!fill) {
          continue;
        }
        selectedBounds.push(fillBounds(fill));
      }

      return combineRects(selectedBounds);
    };

    const moveSelectionBy = (selection: LassoSelection, deltaX: number, deltaY: number) => {
      const canvasMetrics = getCanvasHostMetrics(canvas);
      const minDeltaX = -selection.bounds.x;
      const maxDeltaX =
        canvasMetrics.width - (selection.bounds.x + selection.bounds.width);
      const minDeltaY = -selection.bounds.y;
      const maxDeltaY =
        canvasMetrics.height - (selection.bounds.y + selection.bounds.height);
      const boundedDeltaX = clampNumber(
        deltaX,
        Math.min(minDeltaX, maxDeltaX),
        Math.max(minDeltaX, maxDeltaX),
      );
      const boundedDeltaY = clampNumber(
        deltaY,
        Math.min(minDeltaY, maxDeltaY),
        Math.max(minDeltaY, maxDeltaY),
      );

      if (Math.abs(boundedDeltaX) < 0.001 && Math.abs(boundedDeltaY) < 0.001) {
        return;
      }

      for (const index of selection.strokeIndexes) {
        const stroke = strokesRef.current[index];
        if (!stroke) {
          continue;
        }
        stroke.points = stroke.points.map((point) => ({
          ...point,
          x: point.x + boundedDeltaX,
          y: point.y + boundedDeltaY,
        }));
        if (stroke.clipRect) {
          stroke.clipRect = {
            ...stroke.clipRect,
            x: stroke.clipRect.x + boundedDeltaX,
            y: stroke.clipRect.y + boundedDeltaY,
          };
        }
      }

      for (const index of selection.symbolIndexes) {
        const currentSymbol = symbolsRef.current[index];
        if (!currentSymbol) {
          continue;
        }
        currentSymbol.x += boundedDeltaX;
        currentSymbol.y += boundedDeltaY;
        if (currentSymbol.clipRect) {
          currentSymbol.clipRect = {
            ...currentSymbol.clipRect,
            x: currentSymbol.clipRect.x + boundedDeltaX,
            y: currentSymbol.clipRect.y + boundedDeltaY,
          };
        }
      }

      for (const index of selection.imageIndexes) {
        const currentImage = imagesRef.current[index];
        if (!currentImage) {
          continue;
        }
        currentImage.x += boundedDeltaX;
        currentImage.y += boundedDeltaY;
        if (currentImage.clipRect) {
          currentImage.clipRect = {
            ...currentImage.clipRect,
            x: currentImage.clipRect.x + boundedDeltaX,
            y: currentImage.clipRect.y + boundedDeltaY,
          };
        }
      }

      for (const index of selection.fillIndexes) {
        const fill = fillsRef.current[index];
        if (!fill) {
          continue;
        }
        fill.rect = {
          ...fill.rect,
          x: fill.rect.x + boundedDeltaX,
          y: fill.rect.y + boundedDeltaY,
        };
        if (fill.points) {
          fill.points = fill.points.map((point) => ({
            ...point,
            x: point.x + boundedDeltaX,
            y: point.y + boundedDeltaY,
          }));
        }
        if (fill.clipRect) {
          fill.clipRect = {
            ...fill.clipRect,
            x: fill.clipRect.x + boundedDeltaX,
            y: fill.clipRect.y + boundedDeltaY,
          };
        }
      }
    };

    const onStart = (event: PointerLikeEvent) => {
      const canDraw = canDrawWithInput(event);
      console.log("[ink] onStart", event.pointerId, event.pointerType, "canDraw:", canDraw, "activeStroke:", activeStrokeRef.current?.pointerId ?? null);
      if (!canDraw) {
        if (
          event.pointerType === "touch" &&
          !event.isStylus &&
          stylusPointerIdsRef.current.size > 0
        ) {
          // Prevent accidental text selection while resting the palm.
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      // Hidden spreads can initialize at 1px; ensure the canvas is sized to the paper
      // when the user starts interacting after a navigation.
      resizeCanvas();

      const runtimeConfig = runtimeConfigRef.current;
      const activeMode = runtimeConfig.mode;

      if (event.target instanceof HTMLElement) {
        const isInkDrawingMode =
          activeMode === "draw" ||
          activeMode === "erase" ||
          activeMode === "shape" ||
          activeMode === "lasso";
        const blockedTarget = isInkDrawingMode
          ? event.target.closest("a, button, input, select, label")
          : event.target.closest(
              "a, button, input, select, label, textarea, [data-sticky-note]",
            );
        if (blockedTarget) {
          console.log("[ink] onStart blocked by", blockedTarget.tagName, blockedTarget.className);
          return;
        }
      }

      const cellClipRect = runtimeConfig.lockToCells
        ? getCellClipRect(event, surface)
        : null;
      if (runtimeConfig.lockToCells && !cellClipRect) {
        return;
      }

      runtimeConfig.onInputType?.(event.pointerType);
      setActiveInkPage();
      const canvasMetrics = getCanvasHostMetrics(canvas);
      const point = getRelativePoint(event, canvasMetrics);
      const stickyTarget = [...stickiesRef.current]
        .reverse()
        .find((sticky) => pointInRect(point, stickyRect(sticky)));
      const stickyTargetRect = stickyTarget ? stickyRect(stickyTarget) : null;
      const effectiveClipRect = stickyTargetRect ?? null;
      const attachedStickyId = stickyTarget?.id;

      if (activeMode === "erase") {
        activeEraserPointerIdRef.current = event.pointerId;
        if (!didSnapshotDuringDragRef.current) {
          captureUndoSnapshot();
          didSnapshotDuringDragRef.current = true;
        }
        eraseAtPoint(point);
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      if (activeMode === "bucket") {
        const bucketStrokeTarget = findBucketTargetStroke(
          strokesRef.current,
          point,
          attachedStickyId,
        );
        if (bucketStrokeTarget) {
          const bucketStrokeBounds =
            polygonBounds(bucketStrokeTarget.points) ??
            strokeBounds(bucketStrokeTarget);
          if (!bucketStrokeBounds) {
            return;
          }

          captureUndoSnapshot();
          const nextFill: InkFill = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            rect: bucketStrokeBounds,
            color: runtimeConfig.color,
            opacity: BUCKET_FILL_OPACITY,
            points: bucketStrokeTarget.points.map((fillPoint) => ({
              ...fillPoint,
            })),
            clipRect: bucketStrokeTarget.clipRect ?? null,
            stickyId: bucketStrokeTarget.stickyId,
          };
          const withoutExistingFill = fillsRef.current.filter(
            (candidate) =>
              !fillPathMatches(
                candidate,
                bucketStrokeBounds,
                bucketStrokeTarget.stickyId,
              ),
          );
          fillsRef.current = [...withoutExistingFill, nextFill];
          persistInk();
          redraw();
          event.preventDefault();
          maybeStopPropagation(event);
          return;
        }

        const fillRect = stickyTargetRect ?? getCellClipRect(event, surface);
        if (!fillRect) {
          return;
        }

        captureUndoSnapshot();
        const nextFill: InkFill = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          rect: fillRect,
          color: runtimeConfig.color,
          opacity: BUCKET_FILL_OPACITY,
          stickyId: attachedStickyId,
        };
        const withoutExistingFill = fillsRef.current.filter(
          (candidate) =>
            !(
              !candidate.points &&
              rectMatches(candidate.rect, fillRect) &&
              candidate.stickyId === attachedStickyId
            ),
        );
        fillsRef.current = [...withoutExistingFill, nextFill];
        persistInk();
        redraw();
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      if (activeMode === "shape") {
        activeShapeRef.current = {
          pointerId: event.pointerId,
          start: point,
          current: point,
          tip: normalizeInkTip(runtimeConfig.tipKind),
          clipRect: effectiveClipRect,
          stickyId: attachedStickyId,
        };
        lassoSelectionRef.current = null;
        event.preventDefault();
        maybeStopPropagation(event);
        redraw();
        return;
      }

      if (activeMode === "lasso") {
        const currentSelection = lassoSelectionRef.current;
        if (currentSelection && rectContainsPoint(currentSelection.bounds, point)) {
          if (!didSnapshotDuringDragRef.current) {
            captureUndoSnapshot();
            didSnapshotDuringDragRef.current = true;
          }
          activeLassoDragRef.current = {
            pointerId: event.pointerId,
            lastPoint: point,
          };
          event.preventDefault();
          maybeStopPropagation(event);
          return;
        }

        lassoSelectionRef.current = null;
        activeLassoRef.current = {
          pointerId: event.pointerId,
          points: [point],
        };
        event.preventDefault();
        maybeStopPropagation(event);
        redraw();
        return;
      }

      if (activeMode === "sticky") {
        captureUndoSnapshot();
        const unclampedSticky: InkSticky = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          x: point.x - DEFAULT_STICKY_WIDTH / 2,
          y: point.y - 20,
          width: DEFAULT_STICKY_WIDTH,
          height: DEFAULT_STICKY_HEIGHT,
          collapsed: false,
          color: normalizeStickyColor(runtimeConfig.color),
        };
        const nextSticky = clampStickyToCanvas(
          unclampedSticky,
          canvasMetrics.width,
          canvasMetrics.height,
        );
        const nextStickies = [...stickiesRef.current, nextSticky];
        stickiesRef.current = nextStickies;
        setStickyNotes(nextStickies);
        runtimeConfig.onStickyNoteCreated?.();
        persistInk();
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      if (activeMode === "image") {
        const currentImageSrc = runtimeConfig.imageSrc;
        if (!currentImageSrc) {
          return;
        }

        captureUndoSnapshot();
        const baseWidth = Math.max(68, runtimeConfig.lineWidth * 30);
        const cached = getOrCreateImage(currentImageSrc);
        const imageRatio =
          cached.naturalWidth > 0 && cached.naturalHeight > 0
            ? cached.naturalHeight / cached.naturalWidth
            : 1;
        const imageWidth = baseWidth;
        const imageHeight = imageWidth * imageRatio;

        const nextImage: InkImage = {
          x: point.x - imageWidth / 2,
          y: point.y - imageHeight / 2,
          width: imageWidth,
          height: imageHeight,
          src: currentImageSrc,
          opacity: clampOpacity(runtimeConfig.opacity),
          clipRect: effectiveClipRect,
          stickyId: attachedStickyId,
        };
        imagesRef.current = [...imagesRef.current, nextImage];
        persistInk();
        redraw();
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      if (runtimeConfig.symbol) {
        captureUndoSnapshot();
        const nextSymbol: InkSymbol = {
          x: point.x,
          y: point.y,
          symbol: runtimeConfig.symbol,
          color: runtimeConfig.color,
          size: Math.max(10, runtimeConfig.lineWidth * 6),
          opacity: clampOpacity(runtimeConfig.opacity),
          clipRect: effectiveClipRect,
          stickyId: attachedStickyId,
        };
        symbolsRef.current = [...symbolsRef.current, nextSymbol];
        persistInk();
        redraw();
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      console.log("[ink] stroke STARTED", event.pointerId, "at", point.x.toFixed(1), point.y.toFixed(1));
      activeStrokeRef.current = {
        pointerId: event.pointerId,
        stroke: {
          color: runtimeConfig.color,
          width: runtimeConfig.lineWidth,
          opacity: clampOpacity(runtimeConfig.opacity),
          tip: normalizeInkTip(runtimeConfig.tipKind),
          points: [point],
          clipRect: effectiveClipRect,
          stickyId: attachedStickyId,
        },
        lastMoveTime: Date.now(),
      };

      lassoSelectionRef.current = null;
      event.preventDefault();
      maybeStopPropagation(event);
    };

    const onMove = (event: PointerLikeEvent) => {
      if (activeEraserPointerIdRef.current === event.pointerId) {
        const canvasMetrics = getCanvasHostMetrics(canvas);
        const point = getRelativePoint(event, canvasMetrics);
        eraseAtPoint(point);
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      const activeShape = activeShapeRef.current;
      if (activeShape && activeShape.pointerId === event.pointerId) {
        const canvasMetrics = getCanvasHostMetrics(canvas);
        activeShape.current = getRelativePoint(event, canvasMetrics);
        redraw();
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      const activeLassoDrag = activeLassoDragRef.current;
      if (activeLassoDrag && activeLassoDrag.pointerId === event.pointerId) {
        const selection = lassoSelectionRef.current;
        if (!selection) {
          return;
        }

        const canvasMetrics = getCanvasHostMetrics(canvas);
        const currentPoint = getRelativePoint(event, canvasMetrics);
        const deltaX = currentPoint.x - activeLassoDrag.lastPoint.x;
        const deltaY = currentPoint.y - activeLassoDrag.lastPoint.y;
        moveSelectionBy(selection, deltaX, deltaY);
        const nextBounds = recomputeSelectionBounds(selection);
        if (nextBounds) {
          selection.bounds = nextBounds;
        }
        activeLassoDrag.lastPoint = currentPoint;
        redraw();
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      const activeLasso = activeLassoRef.current;
      if (activeLasso && activeLasso.pointerId === event.pointerId) {
        const canvasMetrics = getCanvasHostMetrics(canvas);
        const currentPoint = getRelativePoint(event, canvasMetrics);
        const lastPoint = activeLasso.points[activeLasso.points.length - 1];
        const deltaX = currentPoint.x - lastPoint.x;
        const deltaY = currentPoint.y - lastPoint.y;
        if (deltaX * deltaX + deltaY * deltaY >= 9) {
          activeLasso.points = [...activeLasso.points, currentPoint];
        }
        redraw();
        event.preventDefault();
        maybeStopPropagation(event);
        return;
      }

      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }

      const canvasMetrics = getCanvasHostMetrics(canvas);
      const latestPoint = getRelativePoint(event, canvasMetrics);
      const previousPoint =
        activeStroke.stroke.points[activeStroke.stroke.points.length - 1];
      const movementX = latestPoint.x - previousPoint.x;
      const movementY = latestPoint.y - previousPoint.y;
      const alpha = 0.35;
      const smoothedPoint: InkPoint = {
        ...latestPoint,
        pressure:
          alpha * latestPoint.pressure + (1 - alpha) * previousPoint.pressure,
        tiltX:
          alpha * (latestPoint.tiltX ?? 0) +
          (1 - alpha) * (previousPoint.tiltX ?? 0),
        tiltY:
          alpha * (latestPoint.tiltY ?? 0) +
          (1 - alpha) * (previousPoint.tiltY ?? 0),
        altitudeAngle:
          latestPoint.altitudeAngle !== undefined &&
          previousPoint.altitudeAngle !== undefined
            ? alpha * latestPoint.altitudeAngle +
              (1 - alpha) * previousPoint.altitudeAngle
            : latestPoint.altitudeAngle,
      };
      activeStroke.stroke.points.push(smoothedPoint);
      if (movementX * movementX + movementY * movementY >= 16) {
        activeStroke.lastMoveTime = Date.now();
      }
      drawStrokeSegment(activeStroke.stroke);
      event.preventDefault();
      maybeStopPropagation(event);
    };

    const onEnd = (event: PointerLikeEvent) => {
      const runtimeConfig = runtimeConfigRef.current;

      if (activeEraserPointerIdRef.current === event.pointerId) {
        activeEraserPointerIdRef.current = null;
        persistInk();
        didSnapshotDuringDragRef.current = false;
        maybeStopPropagation(event);
        return;
      }

      const activeShape = activeShapeRef.current;
      if (activeShape && activeShape.pointerId === event.pointerId) {
        captureUndoSnapshot();
        const nextStroke = {
          ...shapeStrokeFromPoints(
            runtimeConfig.shapeKind,
            activeShape.start,
            activeShape.current,
            runtimeConfig.color,
            runtimeConfig.lineWidth,
            clampOpacity(runtimeConfig.opacity),
            activeShape.clipRect,
            activeShape.tip,
          ),
          stickyId: activeShape.stickyId,
        };

        strokesRef.current = [...strokesRef.current, nextStroke];
        activeShapeRef.current = null;
        persistInk();
        redraw();
        didSnapshotDuringDragRef.current = false;
        maybeStopPropagation(event);
        return;
      }

      const activeLassoDrag = activeLassoDragRef.current;
      if (activeLassoDrag && activeLassoDrag.pointerId === event.pointerId) {
        activeLassoDragRef.current = null;
        persistInk();
        redraw();
        didSnapshotDuringDragRef.current = false;
        maybeStopPropagation(event);
        return;
      }

      const activeLasso = activeLassoRef.current;
      if (activeLasso && activeLasso.pointerId === event.pointerId) {
        const lassoPolygon = activeLasso.points;
        const lassoRect = polygonBounds(lassoPolygon);
        activeLassoRef.current = null;

        if (!lassoRect || lassoRect.width < 6 || lassoRect.height < 6) {
          lassoSelectionRef.current = null;
          redraw();
          didSnapshotDuringDragRef.current = false;
          maybeStopPropagation(event);
          return;
        }

        lassoSelectionRef.current = computeLassoSelection(lassoPolygon);
        redraw();
        didSnapshotDuringDragRef.current = false;
        maybeStopPropagation(event);
        return;
      }

      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }

      if (activeStroke.stroke.points.length) {
        captureUndoSnapshot();
        strokesRef.current = [...strokesRef.current, activeStroke.stroke];
        persistInk();
      }

      activeStrokeRef.current = null;
      didSnapshotDuringDragRef.current = false;
      redraw();
      maybeStopPropagation(event);
    };

    const onPointerDown = (event: PointerEvent) => {
      console.log("[ink] pointerdown", event.pointerId, event.pointerType, "pressure:", event.pressure, "target:", (event.target as HTMLElement)?.className ?? event.target);
      const stylus = isLikelyStylusPointer(event);
      if (stylus) {
        stylusPointerIdsRef.current.add(event.pointerId);
      }
      const suppressSystemUi =
        shouldSuppressSystemTouchUi(event.target) &&
        (stylus || event.pointerType === "touch" || event.pointerType === "pen");
      if (suppressSystemUi) {
        event.preventDefault();
        clearDocumentSelection();
      }

      const pointerEvent: PointerLikeEvent = {
        pointerId: event.pointerId,
        pointerType: stylus ? "pen" : normalizeInputType(event.pointerType),
        isStylus: stylus,
        clientX: event.clientX,
        clientY: event.clientY,
        pressure: event.pressure,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
        altitudeAngle: Number.isFinite(event.altitudeAngle)
          ? event.altitudeAngle
          : undefined,
        azimuthAngle: Number.isFinite(event.azimuthAngle)
          ? event.azimuthAngle
          : undefined,
        twist: Number.isFinite(event.twist) ? event.twist : undefined,
        tangentialPressure: Number.isFinite(event.tangentialPressure)
          ? event.tangentialPressure
          : undefined,
        target: event.target,
        preventDefault: () => {
          event.preventDefault();
        },
        stopPropagation: () => {
          event.stopPropagation();
        },
      };

      onStart(pointerEvent);

      if (
        activeStrokeRef.current?.pointerId === event.pointerId ||
        activeEraserPointerIdRef.current === event.pointerId ||
        activeShapeRef.current?.pointerId === event.pointerId ||
        activeLassoRef.current?.pointerId === event.pointerId ||
        activeLassoDragRef.current?.pointerId === event.pointerId
      ) {
        // Defer setPointerCapture to the first pointermove to avoid a WKWebView
        // bug: calling setPointerCapture inside pointerdown triggers an immediate
        // pointercancel, killing the stroke before it starts.
        pendingCapturePtrRef.current.add(event.pointerId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      // Resolve any deferred pointer capture now that we have confirmed movement.
      if (pendingCapturePtrRef.current.has(event.pointerId)) {
        pendingCapturePtrRef.current.delete(event.pointerId);
        if (!surface.hasPointerCapture(event.pointerId)) {
          try {
            surface.setPointerCapture(event.pointerId);
          } catch {
            // setPointerCapture can throw if the pointer is no longer active.
          }
        }
      }

      const stylus = stylusPointerIdsRef.current.has(event.pointerId);
      const suppressSystemUi =
        shouldSuppressSystemTouchUi(event.target) &&
        (stylus || event.pointerType === "touch" || event.pointerType === "pen");
      if (suppressSystemUi) {
        event.preventDefault();
        clearDocumentSelection();
      }
      const pointerEvent: PointerLikeEvent = {
        pointerId: event.pointerId,
        pointerType: stylus ? "pen" : normalizeInputType(event.pointerType),
        isStylus: stylus,
        clientX: event.clientX,
        clientY: event.clientY,
        pressure: event.pressure,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
        altitudeAngle: Number.isFinite(event.altitudeAngle)
          ? event.altitudeAngle
          : undefined,
        azimuthAngle: Number.isFinite(event.azimuthAngle)
          ? event.azimuthAngle
          : undefined,
        twist: Number.isFinite(event.twist) ? event.twist : undefined,
        tangentialPressure: Number.isFinite(event.tangentialPressure)
          ? event.tangentialPressure
          : undefined,
        target: event.target,
        preventDefault: () => {
          event.preventDefault();
        },
        stopPropagation: () => {
          event.stopPropagation();
        },
      };
      onMove(pointerEvent);
    };

    const finalizePointer = (event: PointerEvent) => {
      console.log("[ink] finalize", event.type, event.pointerId, event.pointerType);
      const stylus = stylusPointerIdsRef.current.has(event.pointerId);
      const suppressSystemUi =
        shouldSuppressSystemTouchUi(event.target) &&
        (stylus || event.pointerType === "touch" || event.pointerType === "pen");
      if (suppressSystemUi) {
        event.preventDefault();
        clearDocumentSelection();
      }
      const pointerEvent: PointerLikeEvent = {
        pointerId: event.pointerId,
        pointerType: stylus ? "pen" : normalizeInputType(event.pointerType),
        isStylus: stylus,
        clientX: event.clientX,
        clientY: event.clientY,
        pressure: event.pressure,
        tiltX: event.tiltX,
        tiltY: event.tiltY,
        altitudeAngle: Number.isFinite(event.altitudeAngle)
          ? event.altitudeAngle
          : undefined,
        azimuthAngle: Number.isFinite(event.azimuthAngle)
          ? event.azimuthAngle
          : undefined,
        twist: Number.isFinite(event.twist) ? event.twist : undefined,
        tangentialPressure: Number.isFinite(event.tangentialPressure)
          ? event.tangentialPressure
          : undefined,
        target: event.target,
        preventDefault: () => {
          event.preventDefault();
        },
        stopPropagation: () => {
          event.stopPropagation();
        },
      };

      onEnd(pointerEvent);
      stylusPointerIdsRef.current.delete(event.pointerId);
      pendingCapturePtrRef.current.delete(event.pointerId);

      if (surface.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      if (shouldSuppressSystemTouchUi(event.target)) {
        event.preventDefault();
        clearDocumentSelection();
      }
      for (const touch of Array.from(event.changedTouches)) {
        let pointerId = pointerFromTouchIdRef.current.get(touch.identifier);
        if (!pointerId) {
          pointerId = nextTouchPointerIdRef.current;
          nextTouchPointerIdRef.current += 1;
          pointerFromTouchIdRef.current.set(touch.identifier, pointerId);
        }
        const touchWithType = touch as Touch & { touchType?: string };
        const isStylus = touchWithType.touchType === "stylus";
        const touchWithStylus = touch as Touch & {
          altitudeAngle?: number;
          azimuthAngle?: number;
        };
        touchStylusByPointerIdRef.current.set(pointerId, isStylus);
        if (isStylus) {
          stylusPointerIdsRef.current.add(pointerId);
        }

        const pointerEvent: PointerLikeEvent = {
          pointerId,
          pointerType: isStylus ? "pen" : "touch",
          isStylus,
          clientX: touch.clientX,
          clientY: touch.clientY,
          pressure: touch.force || 1,
          tiltX: 0,
          tiltY: 0,
          altitudeAngle: Number.isFinite(touchWithStylus.altitudeAngle)
            ? touchWithStylus.altitudeAngle
            : undefined,
          azimuthAngle: Number.isFinite(touchWithStylus.azimuthAngle)
            ? touchWithStylus.azimuthAngle
            : undefined,
          twist: undefined,
          tangentialPressure: undefined,
          target: event.target,
          preventDefault: () => {
            event.preventDefault();
          },
          stopPropagation: () => {
            event.stopPropagation();
          },
        };
        onStart(pointerEvent);
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (shouldSuppressSystemTouchUi(event.target)) {
        event.preventDefault();
        clearDocumentSelection();
      }
      for (const touch of Array.from(event.changedTouches)) {
        const pointerId = pointerFromTouchIdRef.current.get(touch.identifier);
        if (!pointerId) {
          continue;
        }
        const isStylus = touchStylusByPointerIdRef.current.get(pointerId) ?? false;
        const touchWithStylus = touch as Touch & {
          altitudeAngle?: number;
          azimuthAngle?: number;
        };

        const pointerEvent: PointerLikeEvent = {
          pointerId,
          pointerType: isStylus ? "pen" : "touch",
          isStylus,
          clientX: touch.clientX,
          clientY: touch.clientY,
          pressure: touch.force || 1,
          tiltX: 0,
          tiltY: 0,
          altitudeAngle: Number.isFinite(touchWithStylus.altitudeAngle)
            ? touchWithStylus.altitudeAngle
            : undefined,
          azimuthAngle: Number.isFinite(touchWithStylus.azimuthAngle)
            ? touchWithStylus.azimuthAngle
            : undefined,
          twist: undefined,
          tangentialPressure: undefined,
          target: event.target,
          preventDefault: () => {
            event.preventDefault();
          },
          stopPropagation: () => {
            event.stopPropagation();
          },
        };
        onMove(pointerEvent);
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (shouldSuppressSystemTouchUi(event.target)) {
        event.preventDefault();
        clearDocumentSelection();
      }
      for (const touch of Array.from(event.changedTouches)) {
        const pointerId = pointerFromTouchIdRef.current.get(touch.identifier);
        if (!pointerId) {
          continue;
        }
        pointerFromTouchIdRef.current.delete(touch.identifier);
        const isStylus = touchStylusByPointerIdRef.current.get(pointerId) ?? false;
        touchStylusByPointerIdRef.current.delete(pointerId);
        stylusPointerIdsRef.current.delete(pointerId);
        const touchWithStylus = touch as Touch & {
          altitudeAngle?: number;
          azimuthAngle?: number;
        };

        const pointerEvent: PointerLikeEvent = {
          pointerId,
          pointerType: isStylus ? "pen" : "touch",
          isStylus,
          clientX: touch.clientX,
          clientY: touch.clientY,
          pressure: touch.force || 1,
          tiltX: 0,
          tiltY: 0,
          altitudeAngle: Number.isFinite(touchWithStylus.altitudeAngle)
            ? touchWithStylus.altitudeAngle
            : undefined,
          azimuthAngle: Number.isFinite(touchWithStylus.azimuthAngle)
            ? touchWithStylus.azimuthAngle
            : undefined,
          twist: undefined,
          tangentialPressure: undefined,
          target: event.target,
          preventDefault: () => {
            event.preventDefault();
          },
          stopPropagation: () => {
            event.stopPropagation();
          },
        };
        onEnd(pointerEvent);
      }
    };

    const canHandleHistoryEvent = (targetPageId: string | null): boolean => {
      const spread = surface.closest<HTMLElement>(".planner-spread");
      if (!spread?.classList.contains("is-active")) {
        return false;
      }

      if (targetPageId) {
        return targetPageId === pageId;
      }

      const topVisibleInkLayer = spread.querySelector<HTMLElement>(
        ".ink-layer-root[data-ink-page-id]",
      );
      return topVisibleInkLayer?.dataset.inkPageId === pageId;
    };

    const onUndoEvent = (event: Event) => {
      const detail = (event as CustomEvent<PlannerHistoryEventDetail>).detail;
      const targetPageId = detail?.targetPageId ?? null;
      if (!canHandleHistoryEvent(targetPageId)) {
        return;
      }

      setActiveInkPage();
      handleUndo();
    };

    const onRedoEvent = (event: Event) => {
      const detail = (event as CustomEvent<PlannerHistoryEventDetail>).detail;
      const targetPageId = detail?.targetPageId ?? null;
      if (!canHandleHistoryEvent(targetPageId)) {
        return;
      }

      setActiveInkPage();
      handleRedo();
    };

    strokesRef.current = [];
    symbolsRef.current = [];
    imagesRef.current = [];
    fillsRef.current = [];
    stickiesRef.current = [];
    pointerFromTouchIdRef.current.clear();
    touchStylusByPointerIdRef.current.clear();
    stylusPointerIdsRef.current.clear();
    pendingCapturePtrRef.current.clear();
    activeStrokeRef.current = null;
    activeEraserPointerIdRef.current = null;
    activeShapeRef.current = null;
    activeLassoRef.current = null;
    activeLassoDragRef.current = null;
    activeStickyDragRef.current = null;
    lassoSelectionRef.current = null;
    didSnapshotDuringDragRef.current = false;
    undoStackRef.current = [];
    redoStackRef.current = [];

    try {
      const raw = localStorage.getItem(storageKey(pageId));
      if (raw) {
        const parsed = parseStoredInk(raw);
        strokesRef.current = parsed.strokes.map((stroke) =>
          normalizeStrokeTip(normalizeClipToSticky(stroke)),
        );
        symbolsRef.current = parsed.symbols.map((symbolValue) =>
          normalizeClipToSticky(symbolValue),
        );
        imagesRef.current = parsed.images.map((imageValue) =>
          normalizeClipToSticky(imageValue),
        );
        fillsRef.current = parsed.fills;
        stickiesRef.current = parsed.stickies;
      }
    } catch {
      strokesRef.current = [];
      symbolsRef.current = [];
      imagesRef.current = [];
      fillsRef.current = [];
      stickiesRef.current = [];
    }

    const normalizedStickies = stickiesRef.current.map((sticky) => ({
      ...sticky,
      color: normalizeStickyColor(sticky.color),
    }));
    stickiesRef.current = normalizedStickies;

    queueMicrotask(() => {
      if (canceled) {
        return;
      }
      setStickyNotes(normalizedStickies);
    });

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(surface);
    const spread = surface.closest<HTMLElement>(".planner-spread");
    const spreadActivationObserver =
      spread && "MutationObserver" in window
        ? new MutationObserver(() => {
            if (spread.classList.contains("is-active")) {
              requestAnimationFrame(() => {
                resizeCanvas();
              });
            }
          })
        : null;
    if (spreadActivationObserver && spread) {
      spreadActivationObserver.observe(spread, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    const supportsPointerEvents = "PointerEvent" in window;

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", finalizePointer);
    surface.addEventListener("pointercancel", finalizePointer);
    if (!supportsPointerEvents) {
      surface.addEventListener("touchstart", onTouchStart, { passive: false });
      surface.addEventListener("touchmove", onTouchMove, { passive: false });
      surface.addEventListener("touchend", onTouchEnd, { passive: false });
      surface.addEventListener("touchcancel", onTouchEnd, { passive: false });
    }
    const onContextMenu = (event: Event) => {
      event.preventDefault();
    };
    const onSelectStart = (event: Event) => {
      event.preventDefault();
    };
    const onDocumentContextMenu = (event: Event) => {
      if (
        event.target instanceof Node &&
        surface.contains(event.target)
      ) {
        event.preventDefault();
      }
    };
    document.addEventListener("contextmenu", onDocumentContextMenu, { capture: true });
    surface.addEventListener("contextmenu", onContextMenu);
    surface.addEventListener("selectstart", onSelectStart);
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener(PLANNER_UNDO_EVENT, onUndoEvent);
    window.addEventListener(PLANNER_REDO_EVENT, onRedoEvent);

    return () => {
      canceled = true;
      redrawRef.current = null;
      resizeObserver.disconnect();
      spreadActivationObserver?.disconnect();
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", finalizePointer);
      surface.removeEventListener("pointercancel", finalizePointer);
      if (!supportsPointerEvents) {
        surface.removeEventListener("touchstart", onTouchStart);
        surface.removeEventListener("touchmove", onTouchMove);
        surface.removeEventListener("touchend", onTouchEnd);
        surface.removeEventListener("touchcancel", onTouchEnd);
      }
      surface.removeEventListener("contextmenu", onContextMenu);
      surface.removeEventListener("selectstart", onSelectStart);
      document.removeEventListener("contextmenu", onDocumentContextMenu, { capture: true });
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener(PLANNER_UNDO_EVENT, onUndoEvent);
      window.removeEventListener(PLANNER_REDO_EVENT, onRedoEvent);
    };
  }, [
    captureUndoSnapshot,
    handleRedo,
    handleUndo,
    pageId,
    persistInk,
    setActiveInkPage,
  ]);

  const expandSticky = (id: string) => {
    const currentSticky = stickiesRef.current.find((sticky) => sticky.id === id);
    if (!currentSticky || !currentSticky.collapsed) {
      return;
    }
    setActiveInkPage();
    captureUndoSnapshot();
    const nextStickies = stickiesRef.current.map((sticky) =>
      sticky.id === id ? { ...sticky, collapsed: false } : sticky,
    );
    updateStickyCollection(nextStickies);
    redrawRef.current?.();
  };

  const collapseSticky = (id: string) => {
    const currentSticky = stickiesRef.current.find((sticky) => sticky.id === id);
    if (!currentSticky || currentSticky.collapsed) {
      return;
    }
    setActiveInkPage();
    captureUndoSnapshot();
    const nextStickies = stickiesRef.current.map((sticky) =>
      sticky.id === id ? { ...sticky, collapsed: true } : sticky,
    );
    updateStickyCollection(nextStickies);
    redrawRef.current?.();
  };

  const removeSticky = (id: string) => {
    const existingSticky = stickiesRef.current.find((sticky) => sticky.id === id);
    if (!existingSticky) {
      return;
    }
    setActiveInkPage();
    captureUndoSnapshot();
    const nextStickies = stickiesRef.current.filter((sticky) => sticky.id !== id);
    stickiesRef.current = nextStickies;
    strokesRef.current = strokesRef.current.filter(
      (stroke) => stroke.stickyId !== id,
    );
    symbolsRef.current = symbolsRef.current.filter(
      (symbolValue) => symbolValue.stickyId !== id,
    );
    imagesRef.current = imagesRef.current.filter(
      (imageValue) => imageValue.stickyId !== id,
    );
    fillsRef.current = fillsRef.current.filter((fillValue) => fillValue.stickyId !== id);
    setStickyNotes(nextStickies);
    persistInk();
    redrawRef.current?.();
  };

  const moveSticky = (id: string, x: number, y: number, shouldPersist: boolean) => {
    setActiveInkPage();
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const canvasMetrics = getCanvasHostMetrics(canvas);
    let deltaX = 0;
    let deltaY = 0;
    const nextStickies = stickiesRef.current.map((sticky) => {
      if (sticky.id !== id) {
        return sticky;
      }
      const movedSticky = clampStickyToCanvas(
        {
          ...sticky,
          x,
          y,
        },
        canvasMetrics.width,
        canvasMetrics.height,
      );
      deltaX = movedSticky.x - sticky.x;
      deltaY = movedSticky.y - sticky.y;
      return movedSticky;
    });

    if (Math.abs(deltaX) > 0.001 || Math.abs(deltaY) > 0.001) {
      strokesRef.current = strokesRef.current.map((stroke) => {
        if (stroke.stickyId !== id) {
          return stroke;
        }
        return {
          ...stroke,
          points: stroke.points.map((point) => ({
            ...point,
            x: point.x + deltaX,
            y: point.y + deltaY,
          })),
          clipRect: stroke.clipRect
            ? {
                ...stroke.clipRect,
                x: stroke.clipRect.x + deltaX,
                y: stroke.clipRect.y + deltaY,
              }
            : stroke.clipRect,
        };
      });

      symbolsRef.current = symbolsRef.current.map((symbolValue) => {
        if (symbolValue.stickyId !== id) {
          return symbolValue;
        }
        return {
          ...symbolValue,
          x: symbolValue.x + deltaX,
          y: symbolValue.y + deltaY,
          clipRect: symbolValue.clipRect
            ? {
                ...symbolValue.clipRect,
                x: symbolValue.clipRect.x + deltaX,
                y: symbolValue.clipRect.y + deltaY,
              }
            : symbolValue.clipRect,
        };
      });

      imagesRef.current = imagesRef.current.map((imageValue) => {
        if (imageValue.stickyId !== id) {
          return imageValue;
        }
        return {
          ...imageValue,
          x: imageValue.x + deltaX,
          y: imageValue.y + deltaY,
          clipRect: imageValue.clipRect
            ? {
                ...imageValue.clipRect,
                x: imageValue.clipRect.x + deltaX,
                y: imageValue.clipRect.y + deltaY,
              }
            : imageValue.clipRect,
        };
      });

      fillsRef.current = fillsRef.current.map((fillValue) => {
        if (fillValue.stickyId !== id) {
          return fillValue;
        }
        return {
          ...fillValue,
          rect: {
            ...fillValue.rect,
            x: fillValue.rect.x + deltaX,
            y: fillValue.rect.y + deltaY,
          },
          points: fillValue.points
            ? fillValue.points.map((point) => ({
                ...point,
                x: point.x + deltaX,
                y: point.y + deltaY,
              }))
            : fillValue.points,
          clipRect: fillValue.clipRect
            ? {
                ...fillValue.clipRect,
                x: fillValue.clipRect.x + deltaX,
                y: fillValue.clipRect.y + deltaY,
              }
            : fillValue.clipRect,
        };
      });
    }

    stickiesRef.current = nextStickies;
    setStickyNotes(nextStickies);
    redrawRef.current?.();
    if (shouldPersist) {
      persistInk();
    }
  };

  return (
    <div className="ink-layer-root" data-ink-page-id={pageId}>
      <canvas ref={canvasRef} className="ink-layer-canvas" aria-hidden="true" />
      <div className="sticky-layer">
        {stickyNotes.map((sticky) => {
          const stickyClassSuffix = mode === "sticky" ? "" : " sticky-note-passive";
          const stickyThemeStyle = stickyStyleVars(sticky);
          if (sticky.collapsed) {
            return (
              <button
                key={sticky.id}
                type="button"
                data-sticky-note
                className={`sticky-note sticky-note-collapsed${stickyClassSuffix}`}
                style={{
                  ...stickyThemeStyle,
                  left: `${sticky.x}px`,
                  top: `${sticky.y}px`,
                  width: `${COLLAPSED_STICKY_SIZE}px`,
                  height: `${COLLAPSED_STICKY_SIZE}px`,
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={() => {
                  expandSticky(sticky.id);
                }}
                title="Expand note"
                aria-label="Expand note"
              >
                +
              </button>
            );
          }

          return (
            <section
              key={sticky.id}
              data-sticky-note
              className={`sticky-note sticky-note-expanded${stickyClassSuffix}`}
              style={{
                ...stickyThemeStyle,
                left: `${sticky.x}px`,
                top: `${sticky.y}px`,
                width: `${sticky.width}px`,
                height: `${sticky.height}px`,
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
            >
              <div
                className="sticky-note-header"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (
                    event.target instanceof HTMLElement &&
                    event.target.closest("button")
                  ) {
                    return;
                  }

                  const canvas = canvasRef.current;
                  if (!canvas) {
                    return;
                  }
                  setActiveInkPage();
                  if (!didSnapshotDuringDragRef.current) {
                    captureUndoSnapshot();
                    didSnapshotDuringDragRef.current = true;
                  }

                  const canvasMetrics = getCanvasHostMetrics(canvas);
                  activeStickyDragRef.current = {
                    id: sticky.id,
                    pointerId: event.pointerId,
                    offsetX:
                      (event.clientX - canvasMetrics.rect.left) /
                        canvasMetrics.scaleX -
                      sticky.x,
                    offsetY:
                      (event.clientY - canvasMetrics.rect.top) /
                        canvasMetrics.scaleY -
                      sticky.y,
                  };

                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = activeStickyDragRef.current;
                  if (
                    !drag ||
                    drag.id !== sticky.id ||
                    drag.pointerId !== event.pointerId
                  ) {
                    return;
                  }

                  const canvas = canvasRef.current;
                  if (!canvas) {
                    return;
                  }

                  const canvasMetrics = getCanvasHostMetrics(canvas);
                  const nextX =
                    (event.clientX - canvasMetrics.rect.left) /
                      canvasMetrics.scaleX -
                    drag.offsetX;
                  const nextY =
                    (event.clientY - canvasMetrics.rect.top) /
                      canvasMetrics.scaleY -
                    drag.offsetY;
                  moveSticky(sticky.id, nextX, nextY, false);
                  event.stopPropagation();
                }}
                onPointerUp={(event) => {
                  const drag = activeStickyDragRef.current;
                  if (
                    !drag ||
                    drag.id !== sticky.id ||
                    drag.pointerId !== event.pointerId
                  ) {
                    return;
                  }
                  activeStickyDragRef.current = null;
                  didSnapshotDuringDragRef.current = false;

                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }

                  persistInk();
                  event.stopPropagation();
                }}
                onPointerCancel={(event) => {
                  const drag = activeStickyDragRef.current;
                  if (
                    !drag ||
                    drag.id !== sticky.id ||
                    drag.pointerId !== event.pointerId
                  ) {
                    return;
                  }
                  activeStickyDragRef.current = null;
                  didSnapshotDuringDragRef.current = false;
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  persistInk();
                  event.stopPropagation();
                }}
              >
                <button
                  type="button"
                  className="sticky-note-action"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={() => {
                    collapseSticky(sticky.id);
                  }}
                  title="Collapse note"
                  aria-label="Collapse note"
                >
                  _
                </button>
                <button
                  type="button"
                  className="sticky-note-action"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={() => {
                    removeSticky(sticky.id);
                  }}
                  title="Delete note"
                  aria-label="Delete note"
                >
                  x
                </button>
              </div>
              <div className="sticky-note-pad" />
            </section>
          );
        })}
      </div>
    </div>
  );
}
