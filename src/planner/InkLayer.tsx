import { useEffect, useRef } from "react";

export type InkInputType = "pen" | "touch" | "mouse" | "unknown";
export type InkShapeKind = "line" | "rectangle" | "ellipse";
export type InkLayerMode = "draw" | "erase" | "shape" | "lasso" | "image";

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
}

interface InkPoint {
  x: number;
  y: number;
  pressure: number;
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

interface InkDocument {
  strokes: InkStroke[];
  symbols: InkSymbol[];
  images: InkImage[];
}

interface ActiveStroke {
  pointerId: number;
  stroke: InkStroke;
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
  start: InkPoint;
  current: InkPoint;
}

interface LassoSelection {
  strokeIndexes: number[];
  symbolIndexes: number[];
  imageIndexes: number[];
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
}

const STORAGE_PREFIX = "planner-ink-v1";
const CELL_SELECTOR = "[data-ink-cell]";

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
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { strokes: [], symbols: [], images: [] };
  }

  const maybeDocument = parsed as Partial<InkDocument>;
  return {
    strokes: Array.isArray(maybeDocument.strokes) ? maybeDocument.strokes : [],
    symbols: Array.isArray(maybeDocument.symbols) ? maybeDocument.symbols : [],
    images: Array.isArray(maybeDocument.images) ? maybeDocument.images : [],
  };
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
}: InkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<InkStroke[]>([]);
  const symbolsRef = useRef<InkSymbol[]>([]);
  const imagesRef = useRef<InkImage[]>([]);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const activeEraserPointerIdRef = useRef<number | null>(null);
  const activeShapeRef = useRef<ActiveShape | null>(null);
  const activeLassoRef = useRef<ActiveLasso | null>(null);
  const activeLassoDragRef = useRef<{ pointerId: number; lastPoint: InkPoint } | null>(
    null,
  );
  const lassoSelectionRef = useRef<LassoSelection | null>(null);
  const dprRef = useRef(1);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const pointerFromTouchIdRef = useRef<Map<number, number>>(new Map());
  const nextTouchPointerIdRef = useRef<number>(40000);
  const activePenTapCandidateRef = useRef<PenTapCandidate | null>(null);
  const lastPenTapRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastPenTapArtifactRef = useRef<{ index: number; time: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = canvas?.parentElement;
    if (!canvas || !surface) {
      return;
    }

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
      if (activeLasso) {
        const rectValue = makeRectFromPoints(activeLasso.start, activeLasso.current);
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#6f625d";
        ctx.strokeRect(rectValue.x, rectValue.y, rectValue.width, rectValue.height);
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

    const persistInk = () => {
      try {
        const payload: InkDocument = {
          strokes: strokesRef.current,
          symbols: symbolsRef.current,
          images: imagesRef.current,
        };
        localStorage.setItem(storageKey(pageId), JSON.stringify(payload));
      } catch {
        // Ignore storage failures (private mode / quota).
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

      if (
        nextStrokes.length !== strokesRef.current.length ||
        nextSymbols.length !== symbolsRef.current.length ||
        nextImages.length !== imagesRef.current.length
      ) {
        strokesRef.current = nextStrokes;
        symbolsRef.current = nextSymbols;
        imagesRef.current = nextImages;
        persistInk();
        redraw();
      }
    };

    const computeLassoSelection = (rect: InkClipRect): LassoSelection | null => {
      const strokeIndexes: number[] = [];
      const symbolIndexes: number[] = [];
      const imageIndexes: number[] = [];
      const selectedBounds: InkClipRect[] = [];

      for (let i = 0; i < strokesRef.current.length; i += 1) {
        const bounds = strokeBounds(strokesRef.current[i]);
        if (!bounds || !rectsIntersect(rect, bounds)) {
          continue;
        }
        strokeIndexes.push(i);
        selectedBounds.push(bounds);
      }

      for (let i = 0; i < symbolsRef.current.length; i += 1) {
        const bounds = symbolBounds(symbolsRef.current[i]);
        if (!rectsIntersect(rect, bounds)) {
          continue;
        }
        symbolIndexes.push(i);
        selectedBounds.push(bounds);
      }

      for (let i = 0; i < imagesRef.current.length; i += 1) {
        const bounds = imageBounds(imagesRef.current[i]);
        if (!rectsIntersect(rect, bounds)) {
          continue;
        }
        imageIndexes.push(i);
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
        event.target.closest("a, button, input, select, label")
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
          return;
        }

        lassoSelectionRef.current = null;
        activeLassoRef.current = {
          pointerId: event.pointerId,
          start: point,
          current: point,
        };
        event.preventDefault();
        redraw();
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
      };

      lassoSelectionRef.current = null;
      event.preventDefault();
    };

    const onMove = (event: PointerLikeEvent) => {
      if (activeEraserPointerIdRef.current === event.pointerId) {
        const rect = canvas.getBoundingClientRect();
        const point = getRelativePoint(event, rect);
        updatePenTapMovement(event.pointerId, point);
        eraseAtPoint(point);
        event.preventDefault();
        return;
      }

      const activeShape = activeShapeRef.current;
      if (activeShape && activeShape.pointerId === event.pointerId) {
        const rect = canvas.getBoundingClientRect();
        activeShape.current = getRelativePoint(event, rect);
        updatePenTapMovement(event.pointerId, activeShape.current);
        redraw();
        event.preventDefault();
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
        return;
      }

      const activeLasso = activeLassoRef.current;
      if (activeLasso && activeLasso.pointerId === event.pointerId) {
        const rect = canvas.getBoundingClientRect();
        activeLasso.current = getRelativePoint(event, rect);
        updatePenTapMovement(event.pointerId, activeLasso.current);
        redraw();
        event.preventDefault();
        return;
      }

      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const latestPoint = getRelativePoint(event, rect);
      updatePenTapMovement(event.pointerId, latestPoint);
      activeStroke.stroke.points.push(latestPoint);
      drawStrokeSegment(activeStroke.stroke);
      event.preventDefault();
    };

    const onEnd = (event: PointerLikeEvent) => {
      const rect = canvas.getBoundingClientRect();
      const endPoint = getRelativePoint(event, rect);
      const isPenDoubleTap =
        event.pointerType === "pen" && handlePenTapEnd(event.pointerId, endPoint);

      if (activeEraserPointerIdRef.current === event.pointerId) {
        activeEraserPointerIdRef.current = null;
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
        return;
      }

      const activeLassoDrag = activeLassoDragRef.current;
      if (activeLassoDrag && activeLassoDrag.pointerId === event.pointerId) {
        activeLassoDragRef.current = null;
        persistInk();
        redraw();
        return;
      }

      const activeLasso = activeLassoRef.current;
      if (activeLasso && activeLasso.pointerId === event.pointerId) {
        const lassoRect = makeRectFromPoints(activeLasso.start, activeLasso.current);
        activeLassoRef.current = null;

        if (lassoRect.width < 6 || lassoRect.height < 6) {
          lassoSelectionRef.current = null;
          redraw();
          return;
        }

        lassoSelectionRef.current = computeLassoSelection(lassoRect);
        redraw();
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
        strokesRef.current = [...strokesRef.current, activeStroke.stroke];
        if (
          event.pointerType === "pen" &&
          activeStroke.stroke.points.length <= 2
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
        };
        onEnd(pointerEvent);
      }
    };

    strokesRef.current = [];
    symbolsRef.current = [];
    imagesRef.current = [];
    activeStrokeRef.current = null;
    activeEraserPointerIdRef.current = null;
    activeShapeRef.current = null;
    activeLassoRef.current = null;
    activeLassoDragRef.current = null;
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
      }
    } catch {
      strokesRef.current = [];
      symbolsRef.current = [];
      imagesRef.current = [];
    }

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
    shapeKind,
    symbol,
  ]);

  return <canvas ref={canvasRef} className="ink-layer-canvas" aria-hidden="true" />;
}
