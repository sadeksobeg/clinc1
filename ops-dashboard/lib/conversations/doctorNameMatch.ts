export type DoctorRow = { id: number; display_name: string; specialty: string };

function normalizeName(s: string): string {
  return s
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .trim();
}

/** Jaro similarity (0–1). */
function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;
  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);
  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  return (matches / s1.length + matches / s2.length + (matches - t / 2) / matches) / 3;
}

/** Jaro-Winkler similarity (0–1). */
export function jaroWinklerSimilarity(a: string, b: string, prefixScale = 0.1): number {
  const s1 = normalizeName(a);
  const s2 = normalizeName(b);
  const j = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return j + prefix * prefixScale * (1 - j);
}

export type DoctorMatchResult =
  | { kind: "exact"; doctor: DoctorRow }
  | { kind: "fuzzy"; doctor: DoctorRow; score: number }
  | { kind: "ambiguous"; candidates: DoctorRow[] }
  | { kind: "none" };

export function matchDoctorByName(hint: string, doctors: DoctorRow[], threshold = 0.8): DoctorMatchResult {
  const h = normalizeName(hint);
  if (h.length < 2) return { kind: "none" };

  const exact = doctors.filter((d) => normalizeName(d.display_name) === h);
  if (exact.length === 1) return { kind: "exact", doctor: exact[0]! };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact };

  const contains = doctors.filter((d) => normalizeName(d.display_name).includes(h) || h.includes(normalizeName(d.display_name)));
  if (contains.length === 1) return { kind: "exact", doctor: contains[0]! };
  if (contains.length > 1) return { kind: "ambiguous", candidates: contains.slice(0, 3) };

  let best: DoctorRow | null = null;
  let bestScore = 0;
  const scored: Array<{ doctor: DoctorRow; score: number }> = [];
  for (const d of doctors) {
    const parts = normalizeName(d.display_name).split(/\s+/);
    const family = parts[parts.length - 1] || normalizeName(d.display_name);
    const score = Math.max(jaroWinklerSimilarity(h, d.display_name), jaroWinklerSimilarity(h, family));
    scored.push({ doctor: d, score });
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored.filter((x) => x.score >= threshold);
  if (top.length === 1 && best && bestScore >= threshold) return { kind: "fuzzy", doctor: best, score: bestScore };
  if (top.length > 1) return { kind: "ambiguous", candidates: top.slice(0, 3).map((x) => x.doctor) };
  return { kind: "none" };
}
