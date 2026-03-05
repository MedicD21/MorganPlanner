import { useCallback, useEffect, useRef, useState } from "react";

export type InkInputType = "pen" | "touch" | "mouse" | "unknown";
export type InkShapeKind = "line" | "rectangle" | "ellipse";
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
  onPenDoubleTap?: () => void;
  color?: string;
  lineWidth?: number;
  opacity?: number;
  symbol?: string | null;
  lockToCells?: boolean;
  mode?: InkLayerMode;
  shapeKind?: InkShapeKind;
  imageSrc?: string | null;
  eraseRadius?: number;
  stickyTemplate?: string;
}

interface InkPoint {
  x: number;
  y: number;
  pressure: number;
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
  points: InkPoint[];
  clipRect?: InkClipRect | null;
}

interface InkSymbol {
  x: number;
  y: number;
  symbol: string;
  color: string;
  size: number;
  opacity: number;
  clipRect?: InkClipRect | null;
}

interface InkImage {
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  opacity: number;
  clipRect?: InkClipRect | null;
}

interface InkFill {
  id: string;
  rect: InkClipRect;
  color: string;
  opacity: number;
}

interface InkSticky {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  collapsed: boolean;
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

interface PenTapCandidate {
  pointerId: number;
  startPoint: InkPoint;
  moved: boolean;
  startTime: number;
}

interface ActiveShape {
  pointerId: number;
  start: InkPoint;
  current: InkPoint;
  clipRect?: InkClipRect | null;
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
  clientX: number;
  clientY: number;
  pressure: number;
  target: EventTarget | null;
  preventDefault: () => void;
  stopPropagation: () => void;
}

const STORAGE_PREFIX = "planner-ink-v1";
const CELL_SELECTOR = "[data-ink-cell]";
const DEFAULT_STICKY_WIDTH = 180;
const DEFAULT_STICKY_HEIGHT = 134;
const COLLAPSED_STICKY_SIZE = 30;
const BUCKET_FILL_OPACITY = 0.28;
const AUTO_SHAPE_HOLD_MS = 260;

function normalizeInputType(pointerType: string): InkInputType {
  if (pointerType === "pen" || pointerType === "touch" || pointerType === "mouse") {
    return pointerType;
  }
  return "unknown";
}

function storageKey(pageId: string): string {
  return `${STORAGE_PREFIX}:${pageId}`;
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

function getRelativePoint(event: PointerLikeEvent, rect: DOMRect): InkPoint {
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: clampPressure(event.pressure),
    timestamp: Date.now(),
  };
}

function clampRectToSurface(
  rect: DOMRect,
  surfaceRect: DOMRect,
): InkClipRect | null {
  const left = Math.max(0, rect.left - surfaceRect.left);
  const top = Math.max(0, rect.top - surfaceRect.top);
  const right = Math.min(surfaceRect.width, rect.right - surfaceRect.left);
  const bottom = Math.min(surfaceRect.height, rect.bottom - surfaceRect.top);

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

  return clampRectToSurface(cell.getBoundingClientRect(), surface.getBoundingClientRect());
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
  return fill.rect;
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
): InkStroke {
  if (kind === "line") {
    return {
      color,
      width,
      opacity,
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
      points: [topLeft, topRight, bottomRight, bottomLeft, topLeft],
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
    points,
    clipRect,
  };
}

function pathLength(points: InkPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

function pointToLineDistance(point: InkPoint, a: InkPoint, b: InkPoint): number {
  return distancePointToSegment(point, a, b);
}

function detectAutoShapeStroke(
  stroke: InkStroke,
  holdDurationMs: number,
): InkStroke | null {
  if (holdDurationMs < AUTO_SHAPE_HOLD_MS || stroke.points.length < 8) {
    return null;
  }

  const points = stroke.points;
  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (let i = 1; i < points.length; i += 1) {
    minX = Math.min(minX, points[i].x);
    maxX = Math.max(maxX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxY = Math.max(maxY, points[i].y);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const diagonal = Math.max(1, Math.sqrt(width * width + height * height));
  if (diagonal < 16) {
    return null;
  }

  const start = points[0];
  const end = points[points.length - 1];
  const closedDistance = Math.sqrt(
    (end.x - start.x) * (end.x - start.x) + (end.y - start.y) * (end.y - start.y),
  );
  const isClosed = closedDistance <= Math.max(12, diagonal * 0.22);

  if (!isClosed) {
    let maxDistance = 0;
    for (const point of points) {
      maxDistance = Math.max(maxDistance, pointToLineDistance(point, start, end));
    }
    if (maxDistance <= Math.max(6, diagonal * 0.09)) {
      return shapeStrokeFromPoints(
        "line",
        start,
        end,
        stroke.color,
        stroke.width,
        stroke.opacity,
        stroke.clipRect,
      );
    }
    return null;
  }

  const tolerance = Math.max(8, Math.min(width, height) * 0.2);
  let nearEdgeCount = 0;
  for (const point of points) {
    const distanceToNearestEdge = Math.min(
      Math.abs(point.x - minX),
      Math.abs(point.x - maxX),
      Math.abs(point.y - minY),
      Math.abs(point.y - maxY),
    );
    if (distanceToNearestEdge <= tolerance) {
      nearEdgeCount += 1;
    }
  }
  const edgeCoverage = nearEdgeCount / points.length;

  const cornerTolerance = tolerance * 1.5;
  const corners = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
  let touchedCorners = 0;
  for (const corner of corners) {
    const touched = points.some((point) => {
      const dx = point.x - corner.x;
      const dy = point.y - corner.y;
      return dx * dx + dy * dy <= cornerTolerance * cornerTolerance;
    });
    if (touched) {
      touchedCorners += 1;
    }
  }

  if (edgeCoverage >= 0.72 && touchedCorners >= 3) {
    return shapeStrokeFromPoints(
      "rectangle",
      { x: minX, y: minY, pressure: 1 },
      { x: maxX, y: maxY, pressure: 1 },
      stroke.color,
      stroke.width,
      stroke.opacity,
      stroke.clipRect,
    );
  }

  const radiusX = width / 2;
  const radiusY = height / 2;
  if (radiusX < 8 || radiusY < 8) {
    return null;
  }

  const centerX = minX + radiusX;
  const centerY = minY + radiusY;
  let ellipseErrorSum = 0;
  for (const point of points) {
    const normalized =
      ((point.x - centerX) * (point.x - centerX)) / (radiusX * radiusX) +
      ((point.y - centerY) * (point.y - centerY)) / (radiusY * radiusY);
    ellipseErrorSum += Math.abs(normalized - 1);
  }
  const meanEllipseError = ellipseErrorSum / points.length;

  const travel = pathLength(points);
  const ellipsePerimeterApprox =
    Math.PI * (3 * (radiusX + radiusY) - Math.sqrt((3 * radiusX + radiusY) * (radiusX + 3 * radiusY)));
  const perimeterRatio = ellipsePerimeterApprox > 0 ? travel / ellipsePerimeterApprox : 0;

  if (meanEllipseError <= 0.34 && perimeterRatio > 0.65 && perimeterRatio < 1.45) {
    return shapeStrokeFromPoints(
      "ellipse",
      { x: minX, y: minY, pressure: 1 },
      { x: maxX, y: maxY, pressure: 1 },
      stroke.color,
      stroke.width,
      stroke.opacity,
      stroke.clipRect,
    );
  }

  return null;
}

export default function InkLayer({
  pageId,
  allowTouch = false,
  onInputType,
  onPenDoubleTap,
  color = "#2f2b2a",
  lineWidth = 1.7,
  opacity = 1,
  symbol = null,
  lockToCells = false,
  mode = "draw",
  shapeKind = "line",
  imageSrc = null,
  eraseRadius = 14,
  stickyTemplate = "new note",
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
  const dprRef = useRef(1);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pointerFromTouchIdRef = useRef<Map<number, number>>(new Map());
  const nextTouchPointerIdRef = useRef<number>(40000);
  const activePenTapCandidateRef = useRef<PenTapCandidate | null>(null);
  const lastPenTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastPenTapArtifactRef = useRef<{ index: number; time: number } | null>(null);

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
      const rect = canvas.getBoundingClientRect();
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      for (const fill of fillsRef.current) {
        ctx.fillStyle = fill.color;
        ctx.globalAlpha = clampOpacity(fill.opacity);
        ctx.fillRect(fill.rect.x, fill.rect.y, fill.rect.width, fill.rect.height);
        ctx.globalAlpha = 1;
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
          ctx.strokeStyle = stroke.color;
          ctx.fillStyle = stroke.color;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = clampOpacity(stroke.opacity);

          if (stroke.points.length === 1) {
            const point = stroke.points[0];
            ctx.beginPath();
            ctx.arc(point.x, point.y, stroke.width * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            return;
          }

          for (let i = 1; i < stroke.points.length; i += 1) {
            const previousPoint = stroke.points[i - 1];
            const currentPoint = stroke.points[i];
            const segmentPressure =
              (previousPoint.pressure + currentPoint.pressure) / 2;
            ctx.lineWidth = stroke.width * segmentPressure;
            ctx.beginPath();
            ctx.moveTo(previousPoint.x, previousPoint.y);
            ctx.lineTo(currentPoint.x, currentPoint.y);
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
        const previewStroke = shapeStrokeFromPoints(
          shapeKind,
          activeShape.start,
          activeShape.current,
          color,
          lineWidth,
          clampOpacity(opacity),
          activeShape.clipRect,
        );
        drawWithClip(ctx, previewStroke.clipRect, () => {
          ctx.strokeStyle = previewStroke.color;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.globalAlpha = previewStroke.opacity;
          ctx.lineWidth = previewStroke.width;

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
    };

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      dprRef.current = dpr;

      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      redraw();
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
        ctx.strokeStyle = stroke.color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.globalAlpha = clampOpacity(stroke.opacity);
        ctx.lineWidth = stroke.width * segmentPressure;
        ctx.beginPath();
        ctx.moveTo(previousPoint.x, previousPoint.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    };

    const canDrawWithInput = (inputType: InkInputType) => {
      return (
        inputType === "pen" ||
        inputType === "mouse" ||
        inputType === "unknown" ||
        (allowTouch && inputType === "touch")
      );
    };

    const eraseAtPoint = (point: InkPoint) => {
      const radius = Math.max(6, eraseRadius);
      const nextStrokes: InkStroke[] = [];
      for (const stroke of strokesRef.current) {
        const remaining = eraseStrokeAtPoint(stroke, point, radius);
        nextStrokes.push(...remaining);
      }

      const nextSymbols = symbolsRef.current.filter(
        (currentSymbol) =>
          !isPointInsideRadius(currentSymbol.x, currentSymbol.y, point.x, point.y, radius),
      );

      const nextImages = imagesRef.current.filter((currentImage) => {
        const bounds = imageBounds(currentImage);
        return !(
          point.x >= bounds.x - radius &&
          point.x <= bounds.x + bounds.width + radius &&
          point.y >= bounds.y - radius &&
          point.y <= bounds.y + bounds.height + radius
        );
      });

      const nextFills = fillsRef.current.filter((fill) => {
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
        persistInk();
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
      if (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001) {
        return;
      }

      for (const index of selection.strokeIndexes) {
        const stroke = strokesRef.current[index];
        if (!stroke) {
          continue;
        }
        stroke.points = stroke.points.map((point) => ({
          ...point,
          x: point.x + deltaX,
          y: point.y + deltaY,
        }));
      }

      for (const index of selection.symbolIndexes) {
        const currentSymbol = symbolsRef.current[index];
        if (!currentSymbol) {
          continue;
        }
        currentSymbol.x += deltaX;
        currentSymbol.y += deltaY;
      }

      for (const index of selection.imageIndexes) {
        const currentImage = imagesRef.current[index];
        if (!currentImage) {
          continue;
        }
        currentImage.x += deltaX;
        currentImage.y += deltaY;
      }

      for (const index of selection.fillIndexes) {
        const fill = fillsRef.current[index];
        if (!fill) {
          continue;
        }
        fill.rect = {
          ...fill.rect,
          x: fill.rect.x + deltaX,
          y: fill.rect.y + deltaY,
        };
      }
    };

    const updatePenTapMovement = (pointerId: number, point: InkPoint) => {
      const candidate = activePenTapCandidateRef.current;
      if (!candidate || candidate.pointerId !== pointerId || candidate.moved) {
        return;
      }

      const deltaX = point.x - candidate.startPoint.x;
      const deltaY = point.y - candidate.startPoint.y;
      if (deltaX * deltaX + deltaY * deltaY > 36) {
        candidate.moved = true;
      }
    };

    const handlePenTapEnd = (pointerId: number, point: InkPoint): boolean => {
      const candidate = activePenTapCandidateRef.current;
      if (!candidate || candidate.pointerId !== pointerId) {
        return false;
      }

      activePenTapCandidateRef.current = null;

      if (candidate.moved || Date.now() - candidate.startTime > 300) {
        return false;
      }

      const previousTap = lastPenTapRef.current;
      const now = Date.now();
      if (previousTap) {
        const deltaT = now - previousTap.time;
        const deltaX = point.x - previousTap.x;
        const deltaY = point.y - previousTap.y;
        if (deltaT < 360 && deltaX * deltaX + deltaY * deltaY < 900) {
          lastPenTapRef.current = null;
          onPenDoubleTap?.();
          return true;
        }
      }

      lastPenTapRef.current = { x: point.x, y: point.y, time: now };
      return false;
    };

    const onStart = (event: PointerLikeEvent) => {
      if (!canDrawWithInput(event.pointerType)) {
        return;
      }

      if (
        event.target instanceof HTMLElement &&
        event.target.closest(
          "a, button, input, select, label, textarea, [data-sticky-note]",
        )
      ) {
        return;
      }

      const clipRect = lockToCells ? getCellClipRect(event, surface) : null;
      if (lockToCells && !clipRect) {
        return;
      }

      onInputType?.(event.pointerType);
      const rect = canvas.getBoundingClientRect();
      const point = getRelativePoint(event, rect);

      if (event.pointerType === "pen") {
        activePenTapCandidateRef.current = {
          pointerId: event.pointerId,
          startPoint: point,
          moved: false,
          startTime: Date.now(),
        };
      } else {
        activePenTapCandidateRef.current = null;
      }

      if (mode === "erase") {
        activeEraserPointerIdRef.current = event.pointerId;
        eraseAtPoint(point);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (mode === "bucket") {
        const fillRect = getCellClipRect(event, surface);
        if (!fillRect) {
          return;
        }

        const nextFill: InkFill = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          rect: fillRect,
          color,
          opacity: BUCKET_FILL_OPACITY,
        };
        const withoutExistingFill = fillsRef.current.filter(
          (candidate) => !rectMatches(candidate.rect, fillRect),
        );
        fillsRef.current = [...withoutExistingFill, nextFill];
        persistInk();
        redraw();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (mode === "shape") {
        activeShapeRef.current = {
          pointerId: event.pointerId,
          start: point,
          current: point,
          clipRect,
        };
        lassoSelectionRef.current = null;
        event.preventDefault();
        event.stopPropagation();
        redraw();
        return;
      }

      if (mode === "lasso") {
        const currentSelection = lassoSelectionRef.current;
        if (currentSelection && rectContainsPoint(currentSelection.bounds, point)) {
          activeLassoDragRef.current = {
            pointerId: event.pointerId,
            lastPoint: point,
          };
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        lassoSelectionRef.current = null;
        activeLassoRef.current = {
          pointerId: event.pointerId,
          points: [point],
        };
        event.preventDefault();
        event.stopPropagation();
        redraw();
        return;
      }

      if (mode === "sticky") {
        const unclampedSticky: InkSticky = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          x: point.x - DEFAULT_STICKY_WIDTH / 2,
          y: point.y - 20,
          width: DEFAULT_STICKY_WIDTH,
          height: DEFAULT_STICKY_HEIGHT,
          text: stickyTemplate.trim() || "new note",
          collapsed: false,
        };
        const nextSticky = clampStickyToCanvas(
          unclampedSticky,
          rect.width,
          rect.height,
        );
        const nextStickies = [...stickiesRef.current, nextSticky];
        stickiesRef.current = nextStickies;
        setStickyNotes(nextStickies);
        persistInk();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (mode === "image") {
        if (!imageSrc) {
          return;
        }

        const baseWidth = Math.max(68, lineWidth * 30);
        const cached = getOrCreateImage(imageSrc);
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
          src: imageSrc,
          opacity: clampOpacity(opacity),
          clipRect,
        };
        imagesRef.current = [...imagesRef.current, nextImage];
        persistInk();
        redraw();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (symbol) {
        const nextSymbol: InkSymbol = {
          x: point.x,
          y: point.y,
          symbol,
          color,
          size: Math.max(10, lineWidth * 6),
          opacity: clampOpacity(opacity),
          clipRect,
        };
        symbolsRef.current = [...symbolsRef.current, nextSymbol];
        persistInk();
        redraw();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      activeStrokeRef.current = {
        pointerId: event.pointerId,
        stroke: {
          color,
          width: lineWidth,
          opacity: clampOpacity(opacity),
          points: [point],
          clipRect,
        },
        lastMoveTime: Date.now(),
      };

      lassoSelectionRef.current = null;
      event.preventDefault();
      event.stopPropagation();
    };

    const onMove = (event: PointerLikeEvent) => {
      if (activeEraserPointerIdRef.current === event.pointerId) {
        const rect = canvas.getBoundingClientRect();
        const point = getRelativePoint(event, rect);
        updatePenTapMovement(event.pointerId, point);
        eraseAtPoint(point);
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const activeShape = activeShapeRef.current;
      if (activeShape && activeShape.pointerId === event.pointerId) {
        const rect = canvas.getBoundingClientRect();
        activeShape.current = getRelativePoint(event, rect);
        updatePenTapMovement(event.pointerId, activeShape.current);
        redraw();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const activeLassoDrag = activeLassoDragRef.current;
      if (activeLassoDrag && activeLassoDrag.pointerId === event.pointerId) {
        const selection = lassoSelectionRef.current;
        if (!selection) {
          return;
        }

        const rect = canvas.getBoundingClientRect();
        const currentPoint = getRelativePoint(event, rect);
        updatePenTapMovement(event.pointerId, currentPoint);
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
        event.stopPropagation();
        return;
      }

      const activeLasso = activeLassoRef.current;
      if (activeLasso && activeLasso.pointerId === event.pointerId) {
        const rect = canvas.getBoundingClientRect();
        const currentPoint = getRelativePoint(event, rect);
        updatePenTapMovement(event.pointerId, currentPoint);
        const lastPoint = activeLasso.points[activeLasso.points.length - 1];
        const deltaX = currentPoint.x - lastPoint.x;
        const deltaY = currentPoint.y - lastPoint.y;
        if (deltaX * deltaX + deltaY * deltaY >= 9) {
          activeLasso.points = [...activeLasso.points, currentPoint];
        }
        redraw();
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const latestPoint = getRelativePoint(event, rect);
      updatePenTapMovement(event.pointerId, latestPoint);
      const previousPoint =
        activeStroke.stroke.points[activeStroke.stroke.points.length - 1];
      const movementX = latestPoint.x - previousPoint.x;
      const movementY = latestPoint.y - previousPoint.y;
      activeStroke.stroke.points.push(latestPoint);
      if (movementX * movementX + movementY * movementY >= 4) {
        activeStroke.lastMoveTime = Date.now();
      }
      drawStrokeSegment(activeStroke.stroke);
      event.preventDefault();
      event.stopPropagation();
    };

    const onEnd = (event: PointerLikeEvent) => {
      const rect = canvas.getBoundingClientRect();
      const endPoint = getRelativePoint(event, rect);
      const isPenDoubleTap =
        event.pointerType === "pen" && handlePenTapEnd(event.pointerId, endPoint);

      if (activeEraserPointerIdRef.current === event.pointerId) {
        activeEraserPointerIdRef.current = null;
        event.stopPropagation();
        return;
      }

      const activeShape = activeShapeRef.current;
      if (activeShape && activeShape.pointerId === event.pointerId) {
        const nextStroke = shapeStrokeFromPoints(
          shapeKind,
          activeShape.start,
          activeShape.current,
          color,
          lineWidth,
          clampOpacity(opacity),
          activeShape.clipRect,
        );

        strokesRef.current = [...strokesRef.current, nextStroke];
        activeShapeRef.current = null;
        persistInk();
        redraw();
        event.stopPropagation();
        return;
      }

      const activeLassoDrag = activeLassoDragRef.current;
      if (activeLassoDrag && activeLassoDrag.pointerId === event.pointerId) {
        activeLassoDragRef.current = null;
        persistInk();
        redraw();
        event.stopPropagation();
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
          event.stopPropagation();
          return;
        }

        lassoSelectionRef.current = computeLassoSelection(lassoPolygon);
        redraw();
        event.stopPropagation();
        return;
      }

      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }

      if (isPenDoubleTap) {
        const lastArtifact = lastPenTapArtifactRef.current;
        if (lastArtifact && Date.now() - lastArtifact.time < 520) {
          const maybeStroke = strokesRef.current[lastArtifact.index];
          if (maybeStroke && maybeStroke.points.length <= 2) {
            strokesRef.current = strokesRef.current.filter(
              (_, index) => index !== lastArtifact.index,
            );
            persistInk();
          }
        }
        lastPenTapArtifactRef.current = null;
      }

      if (!isPenDoubleTap && activeStroke.stroke.points.length) {
        const shouldSnapShape =
          mode === "draw" &&
          event.pointerType === "pen" &&
          !symbol &&
          Date.now() - activeStroke.lastMoveTime >= AUTO_SHAPE_HOLD_MS;
        const autoShapeStroke = shouldSnapShape
          ? detectAutoShapeStroke(
              activeStroke.stroke,
              Date.now() - activeStroke.lastMoveTime,
            )
          : null;
        const finalizedStroke = autoShapeStroke ?? activeStroke.stroke;

        strokesRef.current = [...strokesRef.current, finalizedStroke];
        if (
          event.pointerType === "pen" &&
          finalizedStroke.points.length <= 2
        ) {
          lastPenTapArtifactRef.current = {
            index: strokesRef.current.length - 1,
            time: Date.now(),
          };
        } else {
          lastPenTapArtifactRef.current = null;
        }
        persistInk();
      }

      activeStrokeRef.current = null;
      redraw();
      event.stopPropagation();
    };

    const onPointerDown = (event: PointerEvent) => {
      const pointerEvent: PointerLikeEvent = {
        pointerId: event.pointerId,
        pointerType: normalizeInputType(event.pointerType),
        clientX: event.clientX,
        clientY: event.clientY,
        pressure: event.pressure,
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
        surface.setPointerCapture(event.pointerId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      const pointerEvent: PointerLikeEvent = {
        pointerId: event.pointerId,
        pointerType: normalizeInputType(event.pointerType),
        clientX: event.clientX,
        clientY: event.clientY,
        pressure: event.pressure,
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
      const pointerEvent: PointerLikeEvent = {
        pointerId: event.pointerId,
        pointerType: normalizeInputType(event.pointerType),
        clientX: event.clientX,
        clientY: event.clientY,
        pressure: event.pressure,
        target: event.target,
        preventDefault: () => {
          event.preventDefault();
        },
        stopPropagation: () => {
          event.stopPropagation();
        },
      };

      onEnd(pointerEvent);

      if (surface.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId);
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) {
        let pointerId = pointerFromTouchIdRef.current.get(touch.identifier);
        if (!pointerId) {
          pointerId = nextTouchPointerIdRef.current;
          nextTouchPointerIdRef.current += 1;
          pointerFromTouchIdRef.current.set(touch.identifier, pointerId);
        }

        const pointerEvent: PointerLikeEvent = {
          pointerId,
          pointerType: "touch",
          clientX: touch.clientX,
          clientY: touch.clientY,
          pressure: touch.force || 1,
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
      for (const touch of Array.from(event.changedTouches)) {
        const pointerId = pointerFromTouchIdRef.current.get(touch.identifier);
        if (!pointerId) {
          continue;
        }

        const pointerEvent: PointerLikeEvent = {
          pointerId,
          pointerType: "touch",
          clientX: touch.clientX,
          clientY: touch.clientY,
          pressure: touch.force || 1,
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
      for (const touch of Array.from(event.changedTouches)) {
        const pointerId = pointerFromTouchIdRef.current.get(touch.identifier);
        if (!pointerId) {
          continue;
        }
        pointerFromTouchIdRef.current.delete(touch.identifier);

        const pointerEvent: PointerLikeEvent = {
          pointerId,
          pointerType: "touch",
          clientX: touch.clientX,
          clientY: touch.clientY,
          pressure: touch.force || 1,
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

    strokesRef.current = [];
    symbolsRef.current = [];
    imagesRef.current = [];
    fillsRef.current = [];
    stickiesRef.current = [];
    activeStrokeRef.current = null;
    activeEraserPointerIdRef.current = null;
    activeShapeRef.current = null;
    activeLassoRef.current = null;
    activeLassoDragRef.current = null;
    activeStickyDragRef.current = null;
    lassoSelectionRef.current = null;
    activePenTapCandidateRef.current = null;
    lastPenTapRef.current = null;
    lastPenTapArtifactRef.current = null;

    try {
      const raw = localStorage.getItem(storageKey(pageId));
      if (raw) {
        const parsed = parseStoredInk(raw);
        strokesRef.current = parsed.strokes;
        symbolsRef.current = parsed.symbols;
        imagesRef.current = parsed.images;
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

    queueMicrotask(() => {
      if (canceled) {
        return;
      }
      setStickyNotes(stickiesRef.current);
    });

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(surface);

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
    window.addEventListener("resize", resizeCanvas);

    return () => {
      canceled = true;
      resizeObserver.disconnect();
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
      window.removeEventListener("resize", resizeCanvas);
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
    onPenDoubleTap,
    opacity,
    pageId,
    persistInk,
    shapeKind,
    stickyTemplate,
    symbol,
  ]);

  const expandSticky = (id: string) => {
    const nextStickies = stickiesRef.current.map((sticky) =>
      sticky.id === id ? { ...sticky, collapsed: false } : sticky,
    );
    updateStickyCollection(nextStickies);
  };

  const collapseSticky = (id: string) => {
    const nextStickies = stickiesRef.current.map((sticky) =>
      sticky.id === id ? { ...sticky, collapsed: true } : sticky,
    );
    updateStickyCollection(nextStickies);
  };

  const removeSticky = (id: string) => {
    const nextStickies = stickiesRef.current.filter((sticky) => sticky.id !== id);
    updateStickyCollection(nextStickies);
  };

  const setStickyText = (id: string, text: string) => {
    const nextStickies = stickiesRef.current.map((sticky) =>
      sticky.id === id ? { ...sticky, text } : sticky,
    );
    updateStickyCollection(nextStickies);
  };

  const moveSticky = (id: string, x: number, y: number, shouldPersist: boolean) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const rect = canvas.getBoundingClientRect();
    const nextStickies = stickiesRef.current.map((sticky) => {
      if (sticky.id !== id) {
        return sticky;
      }
      return clampStickyToCanvas(
        {
          ...sticky,
          x,
          y,
        },
        rect.width,
        rect.height,
      );
    });

    stickiesRef.current = nextStickies;
    setStickyNotes(nextStickies);
    if (shouldPersist) {
      persistInk();
    }
  };

  return (
    <div className="ink-layer-root">
      <canvas ref={canvasRef} className="ink-layer-canvas" aria-hidden="true" />
      <div className="sticky-layer">
        {stickyNotes.map((sticky) => {
          if (sticky.collapsed) {
            const stickyLabel =
              typeof sticky.text === "string" && sticky.text.trim().length > 0
                ? sticky.text.trim().slice(0, 1).toUpperCase()
                : "+";
            return (
              <button
                key={sticky.id}
                type="button"
                data-sticky-note
                className="sticky-note sticky-note-collapsed"
                style={{
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
                {stickyLabel}
              </button>
            );
          }

          return (
            <section
              key={sticky.id}
              data-sticky-note
              className="sticky-note sticky-note-expanded"
              style={{
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

                  const rect = canvas.getBoundingClientRect();
                  activeStickyDragRef.current = {
                    id: sticky.id,
                    pointerId: event.pointerId,
                    offsetX: event.clientX - rect.left - sticky.x,
                    offsetY: event.clientY - rect.top - sticky.y,
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

                  const rect = canvas.getBoundingClientRect();
                  const nextX = event.clientX - rect.left - drag.offsetX;
                  const nextY = event.clientY - rect.top - drag.offsetY;
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
              <textarea
                className="sticky-note-body"
                value={typeof sticky.text === "string" ? sticky.text : ""}
                onChange={(event) => {
                  setStickyText(sticky.id, event.target.value);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                placeholder="Write here..."
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}
