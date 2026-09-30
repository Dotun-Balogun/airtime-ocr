"use client";
import { useEffect, useRef, useState } from "react";

type Rect = { x: number; y: number; w: number; h: number }; // 0..1 fractions of the image
const MIN = 0.06;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Lets the user drag a crop box over the captured photo, rotate it, retake, or confirm. */
export default function Cropper({
  src,
  onRetake,
  onConfirm,
}: {
  src: string;
  onRetake: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect>({ x: 0.1, y: 0.35, w: 0.8, h: 0.3 });
  const [rotation, setRotation] = useState(0); // 0 | 90 | 180 | 270
  const drag = useRef<{ mode: string; startX: number; startY: number; start: Rect } | null>(null);

  useEffect(() => setRect({ x: 0.1, y: 0.35, w: 0.8, h: 0.3 }), [src]);

  function pointerDown(mode: string) {
    return (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as Element).setPointerCapture(e.pointerId);
      drag.current = { mode, startX: e.clientX, startY: e.clientY, start: rect };
    };
  }

  function pointerMove(e: React.PointerEvent) {
    if (!drag.current || !boxRef.current) return;
    const b = boxRef.current.getBoundingClientRect();
    const dx = (e.clientX - drag.current.startX) / b.width;
    const dy = (e.clientY - drag.current.startY) / b.height;
    const s = drag.current.start;
    let r = { ...s };
    const { mode } = drag.current;
    if (mode === "move") {
      r.x = clamp(s.x + dx, 0, 1 - s.w);
      r.y = clamp(s.y + dy, 0, 1 - s.h);
    } else {
      if (mode.includes("e")) r.w = clamp(s.w + dx, MIN, 1 - s.x);
      if (mode.includes("s")) r.h = clamp(s.h + dy, MIN, 1 - s.y);
      if (mode.includes("w")) {
        const nx = clamp(s.x + dx, 0, s.x + s.w - MIN);
        r.w = s.w + (s.x - nx);
        r.x = nx;
      }
      if (mode.includes("n")) {
        const ny = clamp(s.y + dy, 0, s.y + s.h - MIN);
        r.h = s.h + (s.y - ny);
        r.y = ny;
      }
    }
    setRect(r);
  }
  const pointerUp = () => (drag.current = null);

  async function confirm() {
    const img = imgRef.current!;
    const rotated = document.createElement("canvas");
    const sw = rotation % 180 === 0 ? img.naturalWidth : img.naturalHeight;
    const sh = rotation % 180 === 0 ? img.naturalHeight : img.naturalWidth;
    rotated.width = sw;
    rotated.height = sh;
    const rctx = rotated.getContext("2d")!;
    rctx.translate(sw / 2, sh / 2);
    rctx.rotate((rotation * Math.PI) / 180);
    rctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

    const sx = rect.x * sw, sy = rect.y * sh, cw = rect.w * sw, ch = rect.h * sh;
    // Upscale small crops so tiny printed PINs give OCR more pixels to work with.
    const scale = Math.max(1, Math.min(3, 1100 / cw));
    const out = document.createElement("canvas");
    out.width = Math.round(cw * scale);
    out.height = Math.round(ch * scale);
    const octx = out.getContext("2d")!;
    octx.imageSmoothingQuality = "high";
    octx.drawImage(rotated, sx, sy, cw, ch, 0, 0, out.width, out.height);
    out.toBlob((b) => b && onConfirm(b), "image/jpeg", 0.95);
  }

  const handle = (pos: string, cursor: string) => (
    <div
      onPointerDown={pointerDown(pos)}
      className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-black bg-emerald-400"
      style={{
        cursor,
        left: `${pos.includes("w") ? 0 : pos.includes("e") ? 100 : 50}%`,
        top: `${pos.includes("n") ? 0 : pos.includes("s") ? 100 : 50}%`,
      }}
    />
  );

  return (
    <div className="space-y-3">
      <div ref={boxRef} className="relative touch-none overflow-hidden rounded-xl bg-black select-none" onPointerMove={pointerMove} onPointerUp={pointerUp}>
        <img
          ref={imgRef}
          src={src}
          alt="Captured card"
          draggable={false}
          className="block w-full"
          style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "center" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/55" />
        <div
          onPointerDown={pointerDown("move")}
          className="absolute cursor-move touch-none border-2 border-emerald-400"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.w * 100}%`,
            height: `${rect.h * 100}%`,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0)",
            backgroundColor: "rgba(0,0,0,0)",
            backdropFilter: "brightness(1.6)",
          }}
        >
          {handle("nw", "nwse-resize")}
          {handle("ne", "nesw-resize")}
          {handle("sw", "nesw-resize")}
          {handle("se", "nwse-resize")}
          {handle("n", "ns-resize")}
          {handle("s", "ns-resize")}
          {handle("w", "ew-resize")}
          {handle("e", "ew-resize")}
        </div>
      </div>
      <p className="text-center text-xs text-slate-400">Drag the box edges so it hugs just the PIN digits, then Scan.</p>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setRotation((r) => (r + 90) % 360)} className="rounded-xl bg-slate-700 px-4 py-3 font-semibold">
          Rotate
        </button>
        <button onClick={onRetake} className="rounded-xl bg-slate-700 px-4 py-3 font-semibold">
          Retake photo
        </button>
        <button onClick={confirm} className="flex-1 rounded-xl bg-emerald-500 py-3 font-semibold text-black">
          Crop &amp; scan
        </button>
      </div>
    </div>
  );
}
