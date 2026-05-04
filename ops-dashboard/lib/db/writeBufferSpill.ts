import { appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { incProductMetric } from "@/lib/observability/productMetrics";

/**
 * Durability: prefer Redis AOF in production (`appendonly yes`, `appendfsync everysec`) so buffered
 * lists survive restarts. Optional disk spill below covers Redis write failures or misconfiguration.
 */

export function writeBufferSpillDir(): string | null {
  const p = (process.env.INBOUND_WRITE_BUFFER_SPILL_PATH || "").trim();
  return p.length > 0 ? p : null;
}

const SPILL_SIZE_FILES = [
  "domain_events.spill.jsonl",
  "domain_events.dual.jsonl",
  "outbound_messages.spill.jsonl",
  "outbound_messages.dual.jsonl",
];

export async function appendWriteBufferSpillLine(fileName: string, line: string): Promise<void> {
  const dir = writeBufferSpillDir();
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  const path = join(dir, fileName);
  const row = `${line.replace(/\n/g, " ")}\n`;
  await appendFile(path, row, "utf8");
  incProductMetric("write_buffer_spill_append_total");
  incProductMetric("write_buffer_spill_bytes_appended_total", Buffer.byteLength(row, "utf8"));
}

/** Approximate total bytes of known spill / dual JSONL files (for periodic worker logs). */
export async function getTotalSpillBytesApprox(): Promise<number> {
  const dir = writeBufferSpillDir();
  if (!dir) return 0;
  let sum = 0;
  for (const f of SPILL_SIZE_FILES) {
    try {
      const s = await stat(join(dir, f));
      sum += s.size;
    } catch {
      /* missing */
    }
  }
  return sum;
}

async function readSpillFile(path: string): Promise<string[]> {
  try {
    const raw = await readFile(path, "utf8");
    return raw.split("\n").filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

async function writeSpillFile(path: string, lines: string[]): Promise<void> {
  if (!lines.length) {
    try {
      await writeFile(path, "", "utf8");
    } catch {
      /* ignore */
    }
    return;
  }
  await writeFile(path, `${lines.join("\n")}\n`, "utf8");
}

/**
 * Drain up to `max` JSONL lines from spill file using a row handler; rewrites file with remaining lines.
 */
export async function drainJsonlSpillFile(
  fileName: string,
  max: number,
  onRow: (line: string) => Promise<boolean>,
): Promise<number> {
  const dir = writeBufferSpillDir();
  if (!dir || max <= 0) return 0;
  const path = join(dir, fileName);
  const lines = await readSpillFile(path);
  if (!lines.length) return 0;
  let done = 0;
  const rest: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (done >= max) {
      rest.push(...lines.slice(i));
      break;
    }
    const ok = await onRow(lines[i]!);
    if (ok) {
      done += 1;
      incProductMetric("write_buffer_spill_replay_row_total");
    } else rest.push(lines[i]!);
  }
  await writeSpillFile(path, rest);
  return done;
}
