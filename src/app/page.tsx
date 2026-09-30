"use client";
import { useCallback, useEffect, useState } from "react";
import Scanner from "@/components/Scanner";
import Cropper from "@/components/Cropper";
import { runCloudOcr, runLocalOcr, type OcrResult } from "@/lib/ocr";
import { NETWORKS, type Network, buildUssd, extractPin, formatPin, isValidPin, pinSchema, telHref } from "@/lib/pin";
import { addHistory, clearHistory, listHistory, setStatus, type HistoryItem, type Status } from "@/lib/history";

const badge: Record<Status, string> = {
  pending: "text-amber-400",
  success: "text-emerald-400",
  failed: "text-red-400",
};

type Stage = "capture" | "crop" | "review";

export default function Home() {
  const [stage, setStage] = useState<Stage>("capture");
  const [rawUrl, setRawUrl] = useState("");
  const [preview, setPreview] = useState("");
  const [pin, setPin] = useState("");
  const [network, setNetwork] = useState<Network>("MTN");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [info, setInfo] = useState("");
  const [cloudOn, setCloudOn] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const refresh = useCallback(async () => setHistory(await listHistory()), []);
  useEffect(() => void refresh(), [refresh]);

  function onCapture(blob: Blob) {
    setRawUrl(URL.createObjectURL(blob));
    setStage("crop");
  }

  function retake() {
    setStage("capture");
    setRawUrl("");
  }

  async function onCropConfirm(blob: Blob) {
    setPreview(URL.createObjectURL(blob));
    setStage("review");
    setBusy(true);
    setProgress(0);
    setInfo("");
    try {
      let r: OcrResult = await runLocalOcr(blob, setProgress);
      let source = "on-device";
      const confident = isValidPin(r.pin) && (r.confidence ?? 0) >= 70;
      if (!confident && cloudOn) {
        try {
          const c = await runCloudOcr(blob);
          if (isValidPin(c.pin)) [r, source] = [c, "cloud"];
        } catch (e) {
          setInfo(e instanceof Error ? e.message : "Cloud OCR failed");
        }
      }
      setPin(extractPin(r.pin));
      const confPart = r.confidence != null ? ` (confidence ${Math.round(r.confidence)}%)` : "";
      setInfo((prev) => prev || `Read ${source}${confPart}. Check the digits below${!isValidPin(r.pin) ? " \u2014 not clear? tap Retake." : "."}`);
    } finally {
      setBusy(false);
    }
  }

  const check = pinSchema.safeParse(pin);
  const ussd = check.success ? buildUssd(pin) : "";
  const pending = history.find((h) => h.status === "pending");

  async function recharge() {
    await addHistory(network, pin);
    await refresh();
    window.location.href = telHref(ussd); // opens the dialer with the code filled in
  }

  async function resolve(item: HistoryItem, status: Status) {
    await setStatus(item.id!, status);
    if (status === "success") {
      setPin("");
      setPreview("");
      setRawUrl("");
      setStage("capture");
      setInfo("");
    } else setInfo("Recharge failed. Check the PIN below, fix any wrong digits and try again.");
    await refresh();
  }

  return (
    <main className="mx-auto max-w-md space-y-5 p-5">
      <h1 className="text-2xl font-bold">AirtimeScan</h1>
      <p className="text-sm text-slate-400">Photograph the card, crop to the PIN, confirm, then recharge.</p>

      {pending && (
        <div className="space-y-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 p-4">
          <p className="text-sm">Did your last recharge ({pending.network}, {pending.maskedPin}) work?</p>
          <div className="flex gap-2">
            <button onClick={() => resolve(pending, "success")} className="flex-1 rounded-lg bg-emerald-500 py-2 font-semibold text-black">Yes, it worked</button>
            <button onClick={() => resolve(pending, "failed")} className="flex-1 rounded-lg bg-red-500 py-2 font-semibold">No, it failed</button>
          </div>
        </div>
      )}

      {stage === "capture" && <Scanner onCapture={onCapture} />}

      {stage === "crop" && rawUrl && <Cropper src={rawUrl} onRetake={retake} onConfirm={onCropConfirm} />}

      {stage === "review" && (
        <div className="space-y-3">
          {preview && <img src={preview} alt="Cropped PIN" className="w-full rounded-xl" />}
          {busy && (
            <div className="h-2 overflow-hidden rounded bg-slate-700">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          <button onClick={retake} className="w-full rounded-xl bg-slate-700 py-3 font-semibold">
            Not clear? Retake photo
          </button>
        </div>
      )}

      {stage === "capture" && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={cloudOn} onChange={(e) => setCloudOn(e.target.checked)} />
          Use cloud OCR when unsure (sends the cropped photo to Google)
        </label>
      )}

      {stage === "review" && (
        <section className="space-y-3 rounded-2xl bg-slate-800/60 p-4">
          <label className="block text-sm text-slate-300">
            Network (for your records)
            <select value={network} onChange={(e) => setNetwork(e.target.value as Network)} className="mt-1 w-full rounded-lg bg-slate-900 p-3">
              {NETWORKS.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <label className="block text-sm text-slate-300">
            Recharge PIN
            <input
              inputMode="numeric"
              value={formatPin(pin)}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 16))}
              placeholder="Scan or type the PIN"
              className="mt-1 w-full rounded-lg bg-slate-900 p-3 font-mono text-lg tracking-wider"
            />
          </label>
          {info && <p className="text-sm text-slate-400">{info}</p>}
          {pin && !check.success && <p className="text-sm text-amber-400">{check.error.issues[0].message}</p>}
          {ussd && <p className="font-mono text-sm text-slate-400">Will dial: {ussd}</p>}
          <button disabled={!check.success || !!pending} onClick={recharge} className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-black disabled:opacity-40">
            Recharge now
          </button>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">History</h2>
          {history.length > 0 && (
            <button onClick={async () => { await clearHistory(); refresh(); }} className="text-sm text-slate-400">Clear</button>
          )}
        </div>
        <ul className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex justify-between rounded-lg bg-slate-800/60 p-3">
              <span>
                {h.network} · <span className="font-mono">{h.maskedPin}</span>{" "}
                {h.status && <span className={badge[h.status]}>{h.status}</span>}
              </span>
              <span className="text-slate-400">{new Date(h.at).toLocaleDateString()}</span>
            </li>
          ))}
          {history.length === 0 && <li className="text-slate-500">No recharges yet.</li>}
        </ul>
      </section>
    </main>
  );
}
