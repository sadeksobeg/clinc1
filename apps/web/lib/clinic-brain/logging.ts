export type ClinicLogEntry = {
  t: string;
  kind: string;
  [key: string]: unknown;
};

const STORAGE_KEY = "clinic-os:ops-log:v1";
const MAX_ENTRIES = 200;

export function appendLog(entry: ClinicLogEntry): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: ClinicLogEntry[] = raw ? (JSON.parse(raw) as ClinicLogEntry[]) : [];
    const next = [...list, entry].slice(-MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

export function readLog(): ClinicLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ClinicLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearLog(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportLogJson(): string {
  return JSON.stringify(readLog(), null, 2);
}
