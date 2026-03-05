import { useEffect, useRef } from "react";

export type InkInputType = "pen" | "touch" | "mouse" | "unknown";

interface InkLayerProps {
  pageId: string;
  allowTouch?: boolean;
  onInputType?: (inputType: InkInputType) => void;
  color?: string;
  lineWidth?: number;
  opacity?: number;
  symbol?: string | null;
  lockToCells?: boolean;
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

interface InkDocument {
  strokes: InkStroke[];
  symbols: InkSymbol[];
}

interface ActiveStroke {
  pointerId: number;
  stroke: InkStroke;
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

function getRelativePoint(event: PointerEvent, rect: DOMRect): InkPoint {
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    pressure: clampPressure(event.pressure),
  };
}

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(Math.max(value, 0.05), 1);
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
  event: PointerEvent,
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
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { strokes: [], symbols: [] };
  }

  const maybeDocument = parsed as Partial<InkDocument>;

  return {
    strokes: Array.isArray(maybeDocument.strokes) ? maybeDocument.strokes : [],
    symbols: Array.isArray(maybeDocument.symbols) ? maybeDocument.symbols : [],
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

export default function InkLayer({
  pageId,
  allowTouch = false,
  onInputType,
  color = "#2f2b2a",
  lineWidth = 1.7,
  opacity = 1,
  symbol = null,
  lockToCells = false,
}: InkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<InkStroke[]>([]);
  const symbolsRef = useRef<InkSymbol[]>([]);
  const activeStrokeRef = useRef<ActiveStroke | null>(null);
  const dprRef = useRef(1);

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

    const redraw = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.setTransform(dprRef.current, 0, 0, dprRef.current, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

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
            const segmentPressure = (previousPoint.pressure + currentPoint.pressure) / 2;
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
    };

    const persistInk = () => {
      try {
        const payload: InkDocument = {
          strokes: strokesRef.current,
          symbols: symbolsRef.current,
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
      return inputType === "pen" || inputType === "mouse" || (allowTouch && inputType === "touch");
    };

    const onPointerDown = (event: PointerEvent) => {
      const inputType = normalizeInputType(event.pointerType);
      if (!canDrawWithInput(inputType)) {
        return;
      }

      if (event.target instanceof HTMLElement && event.target.closest("a, button, input, select, label")) {
        return;
      }

      const clipRect = lockToCells ? getCellClipRect(event, surface) : null;
      if (lockToCells && !clipRect) {
        return;
      }

      onInputType?.(inputType);
      const rect = canvas.getBoundingClientRect();
      const point = getRelativePoint(event, rect);

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

      event.preventDefault();
      surface.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      activeStroke.stroke.points.push(getRelativePoint(event, rect));
      drawStrokeSegment(activeStroke.stroke);
      event.preventDefault();
    };

    const finalizeStroke = (event: PointerEvent) => {
      const activeStroke = activeStrokeRef.current;
      if (!activeStroke || activeStroke.pointerId !== event.pointerId) {
        return;
      }

      if (activeStroke.stroke.points.length) {
        strokesRef.current = [...strokesRef.current, activeStroke.stroke];
        persistInk();
      }

      activeStrokeRef.current = null;
      redraw();

      if (surface.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId);
      }
    };

    strokesRef.current = [];
    symbolsRef.current = [];
    activeStrokeRef.current = null;

    try {
      const raw = localStorage.getItem(storageKey(pageId));
      if (raw) {
        const parsed = parseStoredInk(raw);
        strokesRef.current = parsed.strokes;
        symbolsRef.current = parsed.symbols;
      }
    } catch {
      strokesRef.current = [];
      symbolsRef.current = [];
    }

    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(surface);

    surface.addEventListener("pointerdown", onPointerDown);
    surface.addEventListener("pointermove", onPointerMove);
    surface.addEventListener("pointerup", finalizeStroke);
    surface.addEventListener("pointercancel", finalizeStroke);
    window.addEventListener("resize", resizeCanvas);

    return () => {
      resizeObserver.disconnect();
      surface.removeEventListener("pointerdown", onPointerDown);
      surface.removeEventListener("pointermove", onPointerMove);
      surface.removeEventListener("pointerup", finalizeStroke);
      surface.removeEventListener("pointercancel", finalizeStroke);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [allowTouch, color, lineWidth, lockToCells, onInputType, opacity, pageId, symbol]);

  return <canvas ref={canvasRef} className="ink-layer-canvas" aria-hidden="true" />;
}
