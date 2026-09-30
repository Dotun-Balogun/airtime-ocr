import { openDB, type DBSchema } from "idb";

export type Status = "pending" | "success" | "failed";
export type HistoryItem = {
  id?: number;
  network: string;
  maskedPin: string; // only last 4 digits are ever stored
  at: number;
  status?: Status; // older records may not have one
};
interface Schema extends DBSchema {
  history: { key: number; value: HistoryItem };
}
const db = () =>
  openDB<Schema>("airtime-scan", 1, {
    upgrade: (d) => void d.createObjectStore("history", { keyPath: "id", autoIncrement: true }),
  });

export const mask = (pin: string) => "•".repeat(Math.max(0, pin.length - 4)) + pin.slice(-4);

export async function addHistory(network: string, pin: string): Promise<number> {
  return (await (await db()).add("history", { network, maskedPin: mask(pin), at: Date.now(), status: "pending" })) as number;
}
export async function setStatus(id: number, status: Status) {
  const d = await db();
  const item = await d.get("history", id);
  if (item) await d.put("history", { ...item, status });
}
export async function listHistory(): Promise<HistoryItem[]> {
  return (await (await db()).getAll("history")).reverse();
}
export async function clearHistory() {
  await (await db()).clear("history");
}
