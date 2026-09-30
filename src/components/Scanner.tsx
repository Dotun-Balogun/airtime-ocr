"use client";
import { useEffect, useRef, useState } from "react";

/** Live camera or file upload. The raw photo is handed off for manual cropping next. */
export default function Scanner({ onCapture }: { onCapture: (b: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [err, setErr] = useState("");

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setLive(false);
  };
  useEffect(() => stop, []);

  async function start() {
    setErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      });
      stream.current = s;
      setLive(true);
      requestAnimationFrame(() => {
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
      });
    } catch {
      setErr("Camera unavailable. Use the upload button instead.");
    }
  }

  function snap() {
    const v = video.current;
    if (!v) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => b && (stop(), onCapture(b)), "image/jpeg", 0.95);
  }

  const btn = "rounded-xl px-4 py-3 font-semibold";
  return (
    <div className="space-y-3">
      {live ? (
        <>
          <video ref={video} playsInline muted className="w-full rounded-xl bg-black" />
          <div className="flex gap-2">
            <button onClick={snap} className={`${btn} flex-1 bg-emerald-500 text-black`}>Capture</button>
            <button onClick={stop} className={`${btn} bg-slate-700`}>Cancel</button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <button onClick={start} className={`${btn} flex-1 bg-emerald-500 text-black`}>Open camera</button>
          <label className={`${btn} flex-1 cursor-pointer bg-slate-700 text-center`}>
            Upload photo
            <input
              type="file"
              accept="image/*"
              // capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onCapture(e.target.files[0])}
            />
          </label>
        </div>
      )}
      {err && <p className="text-sm text-amber-400">{err}</p>}
    </div>
  );
}
