import { useEffect, useRef } from "react";

export type InkInputType = "pen" | "touch" | "mouse" | "unknown";

interface InkLayerProps {
  pageId: string;
  allowTouch?: boolean;
  onInputType?: (inputType: InkInputType) => void;
  color?: string;
  lineWidth?: number;
}

interface InkPoint {
  x: number;
  y: number;
  pressure: number;
}

interface InkStroke {
  color: string;
  width: number;
  points: InkPoint[];
}

interface ActiveStroke {
  pointerId: number;
  stroke: InkStroke;
}

const STORAGE_PREFIX = "planner-ink-v1";

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

export default function InkLayer({
  pageId,
  allowTouch = false,
  onInputType,
  color = "#2f2b2a",
  lineWidth = 1.7,
}: InkLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<InkStroke[]>([]);
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

        ctx.strokeStyle = stroke.color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (stroke.points.length === 1) {
          const point = stroke.points[0];
          ctx.beginPath();
          ctx.arc(point.x, point.y, stroke.width * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = stroke.color;
          ctx.fill();
          continue;
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
      }
    };

    const persistStrokes = () => {
      try {
        localStorage.setItem(storageKey(pageId), JSON.stringify(strokesRef.current));
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
      ctx.strokeStyle = stroke.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = stroke.width * segmentPressure;
      ctx.beginPath();
      ctx.moveTo(previousPoint.x, previousPoint.y);
      ctx.lineTo(currentPoint.x, currentPoint.y);
      ctx.stroke();
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

      onInputType?.(inputType);
      const rect = canvas.getBoundingClientRect();
      const firstPoint = getRelativePoint(event, rect);

      activeStrokeRef.current = {
        pointerId: event.pointerId,
        stroke: {
          color,
          width: lineWidth,
          points: [firstPoint],
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
        persistStrokes();
      }

      activeStrokeRef.current = null;
      if (surface.hasPointerCapture(event.pointerId)) {
        surface.releasePointerCapture(event.pointerId);
      }
    };

    try {
      const raw = localStorage.getItem(storageKey(pageId));
      if (raw) {
        const parsed = JSON.parse(raw) as InkStroke[];
        if (Array.isArray(parsed)) {
          strokesRef.current = parsed;
        }
      }
    } catch {
      strokesRef.current = [];
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
  }, [allowTouch, color, lineWidth, onInputType, pageId]);

  return <canvas ref={canvasRef} className="ink-layer-canvas" aria-hidden="true" />;
}
