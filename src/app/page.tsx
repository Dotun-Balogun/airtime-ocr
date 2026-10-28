
import Link from "next/link";

const FEATURES = [
  {
    title: "Scan any recharge card",
    desc: "Point your camera at a scratch card or upload a photo — no app store download required.",
  },
  {
    title: "On-device OCR",
    desc: "Tesseract.js reads the PIN directly in your browser. Your photo never leaves your phone unless you choose to.",
  },
  {
    title: "Crop, straighten, retake",
    desc: "Drag a box around just the PIN and fine-tune the angle for a clean, accurate read every time.",
  },
  {
    title: "One-tap recharge",
    desc: "Confirm the digits and your dialer opens pre-filled with the USSD code — just tap Call.",
  },
  {
    title: "Recharge history",
    desc: "Every attempt is saved on your device, with its outcome, so you can track what worked.",
  },
  {
    title: "Install like an app",
    desc: "Add AirtimeScan to your home screen and open it instantly, even offline.",
  },
];

export default function Welcome() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-between p-6">
      <div>
        <p className="text-xs font-semibold tracking-widest text-emerald-500">
          OPTICAL CHARACTER RECOGNITION
        </p>
        <h1 className="mt-2 text-4xl font-bold">AirtimeScan</h1>
        <p className="mt-3 text-slate-400">
          Photograph a recharge card and let OCR read the PIN for you — no typing, no mistakes.
        </p>

        <Link
          href="/scan"
          className="mt-8 block w-full rounded-xl bg-emerald-500 py-4 text-center text-lg font-semibold text-black"
        >
          Scan Airtime
        </Link>

        <div className="mt-10 space-y-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl bg-slate-800/60 p-4">
              <h2 className="font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="mt-10 border-t border-slate-800 pt-4 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Plateau State Polytechnic, Barkin Ladi Heipang
        <br />
        Department of Computer Science — Final Year Project
      </footer>
    </main>
  );
}
