import { createWorker } from "tesseract.js";
import { extractPin, isValidPin } from "./pin";

export type OcrResult = { text: string; pin: string; confidence: number | null };

async function toCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(blob);
  // Cropped regions are often small; upscale more aggressively than a full photo would need.
  const scale = bmp.width > 2000 ? 2000 / bmp.width : bmp.width < 1000 ? 1000 / bmp.width : 1;
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

function grayscale(c: HTMLCanvasElement): Uint8ClampedArray {
  const { data } = c.getContext("2d")!.getImageData(0, 0, c.width, c.height);
  const g = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return g;
}

function fromGray(g: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < g.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = g[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Stretch contrast between the 2nd and 98th percentile (ignores glare specks). */
function stretch(g: Uint8ClampedArray): Uint8ClampedArray {
  const hist = new Array(256).fill(0);
  g.forEach((v) => hist[v]++);
  const pct = (p: number) => {
    let sum = 0;
    for (let i = 0; i < 256; i++) if ((sum += hist[i]) >= g.length * p) return i;
    return 255;
  };
  const lo = pct(0.02), hi = Math.max(lo + 1, pct(0.98));
  return g.map((v) => ((v - lo) * 255) / (hi - lo));
}

/** Unsharp mask: subtract a blurred copy to make thin printed digit strokes crisper. */
function sharpen(g: Uint8ClampedArray, w: number, h: number, amount = 0.6): Uint8ClampedArray {
  const blur = new Float32Array(g.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += g[yy * w + xx];
          n++;
        }
      }
      blur[y * w + x] = sum / n;
    }
  }
  const out = new Uint8ClampedArray(g.length);
  for (let i = 0; i < g.length; i++) out[i] = g[i] + (g[i] - blur[i]) * amount;
  return out;
}

/** Adaptive threshold: pixel is text if darker than its local neighbourhood mean. */
function adaptive(g: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const W = w + 1;
  const integral = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += g[y * w + x];
      integral[(y + 1) * W + x + 1] = integral[y * W + x + 1] + row;
    }
  }
  const r = Math.max(8, Math.round(w / 30));
  const out = new Uint8ClampedArray(g.length);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = integral[y1 * W + x1] - integral[y0 * W + x1] - integral[y1 * W + x0] + integral[y0 * W + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = g[y * w + x] < mean - 8 ? 0 : 255;
    }
  }
  return out;
}

type Variant = { canvas: HTMLCanvasElement; psm: "6" | "7" };

/** Try several cleaned-up versions of the photo, and both block and single-line reading modes. */
async function buildVariants(blob: Blob): Promise<Variant[]> {
  const base = await toCanvas(blob);
  const { width: w, height: h } = base;
  const gray = grayscale(base);
  const sharpened = sharpen(gray, w, h);
  const stretched = stretch(sharpened);
  const bin = adaptive(stretched, w, h);
  const inverted = bin.map((v) => 255 - v);
  return [
    { canvas: fromGray(stretched, w, h), psm: "7" }, // sharp + contrast, single line (best for a tight PIN crop)
    { canvas: fromGray(bin, w, h), psm: "7" }, // adaptive threshold, single line
    { canvas: fromGray(stretched, w, h), psm: "6" }, // sharp + contrast, block (fallback if not a single line)
    { canvas: fromGray(bin, w, h), psm: "6" }, // adaptive threshold, block
    { canvas: fromGray(inverted, w, h), psm: "6" }, // inverted (light text on dark card)
  ];
}

/** Runs on-device OCR against several cleaned-up variants; keeps the best valid PIN. */
export async function runLocalOcr(blob: Blob, onProgress?: (p: number) => void): Promise<OcrResult> {
  const variants = await buildVariants(blob);
  let step = 0;
  const worker = await createWorker("eng", 1, {
    logger: (m) => m.status === "recognizing text" && onProgress?.((step + m.progress) / variants.length),
  });
  let best: OcrResult = { text: "", pin: "", confidence: 0 };
  try {
    await worker.setParameters({ tessedit_char_whitelist: "0123456789 -" });
    for (step = 0; step < variants.length; step++) {
      await worker.setParameters({ tessedit_pageseg_mode: variants[step].psm as never });
      const { data } = await worker.recognize(variants[step].canvas);
      const cand: OcrResult = { text: data.text, pin: extractPin(data.text), confidence: data.confidence };
      const better =
        (isValidPin(cand.pin) && !isValidPin(best.pin)) ||
        (isValidPin(cand.pin) === isValidPin(best.pin) && (cand.confidence ?? 0) > (best.confidence ?? 0));
      if (better) best = cand;
      if (isValidPin(best.pin) && (best.confidence ?? 0) >= 82) break; // good enough, stop early
    }
  } finally {
    await worker.terminate();
  }
  onProgress?.(1);
  return best;
}

/** Cloud fallback via /api/ocr (Google Cloud Vision). Needs GOOGLE_VISION_API_KEY on the server. */
export async function runCloudOcr(blob: Blob): Promise<OcrResult> {
  const c = await toCanvas(blob);
  const image = c.toDataURL("image/jpeg", 0.9).split(",")[1];
  const res = await fetch("/api/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Cloud OCR failed");
  return { text: json.text, pin: extractPin(json.text), confidence: null };
}
