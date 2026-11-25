// Pure functions, no DOM. Mirrors the cleaning and summary steps in pulse.py.
export const LIMITS = { maxRows: 20000, low: 35, high: 210, maxJump: 25, window: 9 };

// Parses "time_s,bpm" CSV. Returns { rows:[{t,bpm}], errors:[string] }. Never throws on bad rows.
export function parseCsv(text) {
  const errors = [], rows = [];
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return { rows, errors: ["File is empty."] };
  const head = lines[i].split(",").map((s) => s.trim().toLowerCase());
  if (head.length !== 2 || head[0] !== "time_s" || head[1] !== "bpm") {
    return { rows, errors: [`Line ${i + 1}: header must be exactly time_s,bpm.`] };
  }
  for (i += 1; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    if (rows.length >= LIMITS.maxRows) { errors.push(`Stopped at ${LIMITS.maxRows} rows (limit).`); break; }
    const p = raw.split(",");
    const t = Number(p[0]), b = Number(p[1]);
    if (p.length !== 2 || p[0].trim() === "" || p[1].trim() === "" || !Number.isFinite(t) || !Number.isFinite(b)) {
      errors.push(`Line ${i + 1}: expected two numbers, got "${raw.slice(0, 30)}".`); continue;
    }
    if (t < 0) { errors.push(`Line ${i + 1}: time_s is negative.`); continue; }
    if (rows.length && t <= rows[rows.length - 1].t) { errors.push(`Line ${i + 1}: time_s must increase.`); continue; }
    rows.push({ t, bpm: b });
  }
  return { rows, errors };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

// Replaces impossible values or sudden jumps with the previous good value. Returns { clean, removed }.
export function removeArtifacts(bpm, { low, high, maxJump } = LIMITS) {
  const clean = [], idx = []; let last = null, removed = 0;
  const fallback = bpm.length ? median(bpm) : 0;
  for (const v of bpm) {
    const bad = v < low || v > high || (last !== null && Math.abs(v - last) > maxJump);
    if (bad) { clean.push(last !== null ? last : fallback); removed++; idx.push(clean.length - 1); } else { clean.push(v); last = v; }
  }
  return { clean, removed, idx };
}

export function smooth(values, window = LIMITS.window) {
  const h = window >> 1;
  return values.map((_, i) => median(values.slice(Math.max(0, i - h), i + h + 1)));
}

export const ZONES = [["Below 60%", 0, 0.6], ["60-70%", 0.6, 0.7], ["70-80%", 0.7, 0.8], ["80-90%", 0.8, 0.9], ["90%+", 0.9, Infinity]];

// Seconds per zone from sample spacing (each sample counts for the gap to the next one, last uses the median gap).
export function zoneSeconds(rows, bpm, maxHr) {
  const out = Object.fromEntries(ZONES.map((z) => [z[0], 0]));
  const gaps = rows.slice(1).map((r, i) => r.t - rows[i].t), med = gaps.length ? median(gaps) : 0;
  bpm.forEach((v, i) => {
    const dt = i < rows.length - 1 ? gaps[i] : med;
    const z = ZONES.find(([, lo, hi]) => v / maxHr >= lo && v / maxHr < hi);
    if (z) out[z[0]] += dt;
  });
  return out;
}

// Plain facts about the file. No resting, HRV or recovery scores: a CSV of bpm cannot support those.
export function analyze(rows, maxHr = 190) {
  if (rows.length < 2) throw new Error("Need at least 2 valid rows.");
  const raw = rows.map((r) => r.bpm);
  const { clean: c1, removed, idx } = removeArtifacts(raw);
  const clean = smooth(c1);
  let pi = 0; clean.forEach((v, i) => { if (v > clean[pi]) pi = i; });
  const after = rows.findIndex((r) => r.t >= rows[pi].t + 60);
  return {
    samples: rows.length, durationS: rows[rows.length - 1].t - rows[0].t, artifactsRemoved: removed, corrected: idx.map((i) => ({ t: rows[i].t, bpm: rows[i].bpm })),
    minBpm: Math.min(...clean), avgBpm: mean(clean), maxBpm: clean[pi], maxAtS: rows[pi].t,
    dropAfterMax60s: after === -1 ? null : clean[pi] - clean[after],
    zones: zoneSeconds(rows, clean, maxHr), maxHrUsed: maxHr, clean,
  };
}
