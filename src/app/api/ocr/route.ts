import { NextResponse } from "next/server";

/** Cloud OCR fallback. The image is forwarded to Google Cloud Vision and never stored or logged. */
export async function POST(req: Request) {
  const key = process.env.GOOGLE_VISION_API_KEY;
  if (!key) return NextResponse.json({ error: "Cloud OCR is not configured on the server." }, { status: 501 });

  const body = await req.json().catch(() => null);
  const image = body?.image;
  if (typeof image !== "string" || image.length === 0 || image.length > 6_000_000)
    return NextResponse.json({ error: "Invalid image." }, { status: 400 });

  const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ requests: [{ image: { content: image }, features: [{ type: "TEXT_DETECTION" }] }] }),
  });
  if (!res.ok) return NextResponse.json({ error: "Cloud OCR request failed." }, { status: 502 });

  const json = await res.json();
  const text: string = json.responses?.[0]?.fullTextAnnotation?.text ?? "";
  return NextResponse.json({ text });
}
