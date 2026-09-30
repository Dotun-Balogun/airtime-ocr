# AirtimeScan: Automated Airtime Recharge Using OCR (Next.js PWA)

Photograph a scratch card → drag a crop box around just the PIN → OCR reads it → you confirm (or retake) → the dialer opens with `*311*PIN#` filled in → you tell the app if it worked.

## 1. Architecture

```
Camera/upload ──► Manual crop + rotate ──► 5 cleaned variants ──► Tesseract.js ──► PIN extraction
 (Scanner.tsx)      (Cropper.tsx)           (sharpen, contrast,    (ocr.ts)         + OCR-error fixes (pin.ts)
       ▲                  │ not clear?       adaptive threshold,      │ low confidence?
       └──── Retake photo ┘                  inverted; PSM 6 & 7)    └─► optional Google Vision via /api/ocr
                                                                        │
History + status: pending/success/failed (IndexedDB, masked) ◄── "Recharge" ◄── Zod validation ◄── User confirms/edits PIN
      (history.ts)               │
                                 └─► tel:*311*PIN%23  → phone dialer → network credits airtime
```

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| PWA | Serwist (service worker) + `manifest.ts` |
| OCR | Tesseract.js 7 (runs in the browser, no server) |
| Validation | Zod 4 |
| Storage | IndexedDB via `idb` |

### Project structure
```
src/app/page.tsx        main screen (scan, confirm, recharge, history)
src/app/layout.tsx      metadata + viewport
src/app/manifest.ts     PWA manifest
src/app/sw.ts           service worker (Serwist)
src/components/Scanner.tsx   camera capture + upload fallback
src/components/Cropper.tsx   drag-to-crop, rotate, retake
src/lib/ocr.ts          image preprocessing + Tesseract
src/lib/pin.ts          networks, USSD templates, PIN extraction/validation
src/lib/history.ts      IndexedDB history + recharge status (stores only last 4 digits)
src/app/api/ocr/route.ts   optional Google Cloud Vision fallback
.env.example            GOOGLE_VISION_API_KEY
public/icons/           app icons
```

## 2. Setup (step by step)

1. Install **Node.js 22 LTS or newer** from https://nodejs.org (check: `node -v`) and **VS Code**.
2. Unzip the project, open the folder in VS Code, open the terminal (Ctrl+`).
3. Install dependencies: `npm install`
4. Run in development: `npm run dev` → open http://localhost:3000
5. Check types (optional): `npm run typecheck`

### Testing on your phone
The camera needs **HTTPS** (localhost is exempt on the same computer only). Two easy options:
- Deploy to Vercel (section 3) and open the URL on your phone, or
- Run `npm run dev` and tunnel it with `npx localtunnel --port 3000`; open the https link on your phone.

### Production build (test the PWA locally)
```
npm run build
npm start
```
The service worker is disabled in `npm run dev` and only active in the production build.

## 3. Deploy free on Vercel

1. Push the project to GitHub (`git init`, `git add .`, `git commit -m "init"`, create a repo, `git push`).
2. Go to https://vercel.com → **Add New → Project** → import the repo.
3. Keep the defaults and click **Deploy**. The `build` script already uses `next build --webpack` (required by Serwist).
4. Open the `https://…vercel.app` URL on your phone.

### Install as an app
- **Android (Chrome):** menu → *Install app* / *Add to Home screen*.
- **iPhone (Safari):** Share → *Add to Home Screen*.

## 4. Recharge code

All networks now use one universal code, set in `src/lib/pin.ts`:

```ts
export const USSD_TEMPLATE = "*311*{PIN}#";
```

`{PIN}` is replaced with the card number, and `#` is encoded as `%23` in the `tel:` link automatically. The network dropdown is only a label for your history. If the code ever changes, edit that one line.

## 5. How the OCR works

1. **Capture**: photo from the camera or an uploaded file.
2. **Crop** (`Cropper.tsx`): drag the box edges/corners so it hugs just the PIN digits — cutting out logos, barcodes and other numbers is the single biggest accuracy win. Rotate 90° if the photo is sideways. Not happy with the photo itself? *Retake photo* goes back to the camera.
3. **Cleanup** (`ocr.ts`): the cropped area is upscaled (small crops get up to 3x), sharpened (unsharp mask, to crisp up thin printed strokes), then turned into several cleaned versions: contrast-stretched, adaptive-threshold (handles glare/uneven light), and inverted (light text on dark cards).
4. **Recognise**: Tesseract reads each version twice — once as a single line (PSM 7, since a PIN is one row of digits) and once as a block (PSM 6) — with a digits-only whitelist. The best valid, highest-confidence result wins, and it stops early once one is confident (≥ 82%).
5. **Extract** (`pin.ts`): fixes look-alikes (O→0, I/l→1, S→5, B→8, Z→2) and finds a 12-16 digit run.
6. **Cloud fallback (optional)**: if the local result is invalid or under 70% confidence, and the user ticked *Use cloud OCR*, the cropped image goes to `/api/ocr`, which calls Google Cloud Vision.
7. **Confirm**: the user always sees and can edit the PIN before dialing, and can retake at any point before recharging.
8. **Status tracking**: after dialing, the app asks *Did it work?* and records success or failed. On failure the PIN stays in the box so you can fix it and retry.

### Tips for better on-device accuracy (no cloud needed)
- **Crop tight** — the crop box should contain only the PIN, no card border, logo or other printed numbers.
- **Fill the frame** when photographing — get close so the PIN digits are as large as possible before cropping.
- **Flat, even light** — natural daylight or a lamp from the side; avoid direct flash, which causes glare on the scratch-off foil.
- **Steady shot** — rest the phone on something, or brace your elbows, to avoid motion blur.
- **Tilt the card slightly** if you see a bright glare spot, then recapture.
- **Retake rather than accept** a blurry photo — the crop and cleanup steps can't fix a photo that's genuinely out of focus.

### Enable the cloud fallback (optional — the app works fully without it)
1. Go to https://console.cloud.google.com, create a project and enable **billing** (Vision has a free monthly quota).
2. Enable the **Cloud Vision API**.
3. *APIs & Services → Credentials → Create API key*, then restrict it to **Cloud Vision API** only.
4. Locally: copy `.env.example` to `.env.local` and paste the key. On Vercel: *Settings → Environment Variables → `GOOGLE_VISION_API_KEY`*, then redeploy.

The key stays on the server, never in the browser. The checkbox is off by default because it sends the card image to Google. Without a key, the app runs entirely on-device — no account, billing, or card needed — and the checkbox simply reports that cloud OCR isn't configured.

## 6. Known limitations (write these in your report)

- **No silent USSD from a browser.** A PWA can only open the dialer with the code pre-filled; the user taps *Call*. Works best on Android; iOS behaviour with `*` and `#` in `tel:` links is less reliable. A native app (React Native/Kotlin) could send USSD directly: list this under *Future Work*.
- **First OCR run needs internet.** Tesseract.js downloads its engine and English data from a CDN, then the browser caches them. For fully offline use, self-host the files and pass `workerPath`, `corePath` and `langPath` to `createWorker` in `ocr.ts`.
- **Tesseract accuracy** drops on glossy or low-contrast cards. Upgrade path: send the image to a Next.js API route that calls Google Cloud Vision.
- **Security:** full PINs are never stored, only the last 4 digits in history. Never log or send PINs to a server.

## 7. Suggested testing for Chapter 4

Photograph 30-50 cards across lighting (bright, dim, glare), angles and networks. Record for each: PIN correct (yes/no), OCR confidence, number of retakes, and (if you enable it) whether the cloud fallback was needed. Compare on-device-only accuracy before vs. after adding manual cropping — this is a good headline result for your report. Report accuracy = correct / total, plus a breakdown by condition and a list of common misreads.

## 8. Troubleshooting

| Problem | Fix |
|---|---|
| Camera doesn't open | Must be HTTPS; allow camera permission; use *Upload photo* instead |
| Build error about webpack/Turbopack | Use `npm run build` (not `next build`) |
| Old version showing after deploy | Close and reopen the installed app; service worker updates on next load |
| PIN misread | Edit it manually, or tap *Retake photo* and re-crop tighter around just the digits |
| Crop box hard to grab on phone | Drag from the small green circles at the corners/edges, not the middle of a handle |
| `npm install` fails | Upgrade Node.js to v22+ and retry |
