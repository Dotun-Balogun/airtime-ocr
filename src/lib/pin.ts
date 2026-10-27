import { z } from "zod";

/** All networks now use the same universal recharge code. */
export const USSD_TEMPLATE = "*311*{PIN}#";

/** Network is only a label for your history records. */
export const NETWORKS = ["MTN", "Airtel", "Glo", "9mobile"] as const;
export type Network = (typeof NETWORKS)[number];

export const pinSchema = z
  .string()
  .regex(/^\d+$/, "PIN must contain digits only")
  .min(12, "PIN is too short (min 12 digits)")
  .max(17, "PIN is too long (max 17 digits)");

export const isValidPin = (pin: string) => pinSchema.safeParse(pin).success;

/** Fix common OCR confusions inside digit-like text. */
function normalise(text: string): string {
  return text
    .replace(/[OoQD]/g, "0")
    .replace(/[IlL|!]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/[Bb]/g, "8")
    .replace(/[Zz]/g, "2");
}

export function extractPin(raw: string): string {
  const candidates: string[] = [];
  for (const line of normalise(raw).split(/\r?\n/)) {
    for (const m of line.matchAll(/\d(?:[\s-]?\d){11,16}/g)) { // now matches 12–17 digits
      candidates.push(m[0].replace(/\D/g, ""));
    }
  }
  if (candidates.length === 0) {
    const all = normalise(raw).replace(/\D/g, "");
    if (all.length >= 12) candidates.push(all.slice(0, 17)); // was 16
  }
  // Prefer 17-digit matches first now, then longest.
  candidates.sort((a, b) => Number(b.length === 17) - Number(a.length === 17) || b.length - a.length);
  return candidates[0] ?? "";
}
  

export const formatPin = (pin: string) => pin.replace(/(\d{4})(?=\d)/g, "$1 ");
export const buildUssd = (pin: string) => USSD_TEMPLATE.replace("{PIN}", pin);
/** '#' must be encoded as %23 in tel: links. */
export const telHref = (ussd: string) => `tel:${encodeURIComponent(ussd)}`;
