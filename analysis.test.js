import test from "node:test";
import assert from "node:assert/strict";
import { parseCsv, removeArtifacts, smooth, analyze, zoneSeconds } from "./analysis.js";

test("parses valid csv", () => {
  const r = parseCsv("time_s,bpm\n0,70\n1,72\n");
  assert.equal(r.rows.length, 2); assert.deepEqual(r.errors, []);
});
test("rejects wrong header", () => assert.match(parseCsv("a,b\n1,2").errors[0], /header/));
test("empty file", () => assert.match(parseCsv("").errors[0], /empty/));
test("reports bad rows with line numbers and keeps good ones", () => {
  const r = parseCsv("time_s,bpm\n0,70\nx,5\n1,\n2,75\n1.5,80\n-1,60\n");
  assert.equal(r.rows.length, 2); assert.equal(r.errors.length, 4);
  assert.match(r.errors[0], /Line 3/);
});
test("handles BOM and CRLF", () => assert.equal(parseCsv("\uFEFFtime_s,bpm\r\n0,60\r\n1,61\r\n").rows.length, 2));
test("artifacts: dropouts and spikes replaced", () => {
  const { clean, removed } = removeArtifacts([70, 70, 0, 70, 230, 71]);
  assert.deepEqual(clean, [70, 70, 70, 70, 70, 71]); assert.equal(removed, 2);
});
test("smooth is a median", () => assert.deepEqual(smooth([1, 100, 1, 1, 1], 3), [50.5, 1, 1, 1, 1]));
test("zones count seconds", () => {
  const rows = [0, 1, 2, 3].map((t) => ({ t, bpm: 0 }));
  const z = zoneSeconds(rows, [100, 100, 180, 180], 190);
  assert.equal(z["Below 60%"], 2); assert.equal(z["90%+"], 2); assert.equal(z["70-80%"], 0);
});
test("analyze: peak, drop after 60s, no resting/hrv fields", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ t: i, bpm: i < 100 ? 60 + i * 0.5 : 110 - (i - 100) * 0.5 }));
  const a = analyze(rows, 190);
  assert.ok(a.maxAtS >= 97 && a.maxAtS <= 99); assert.ok(a.dropAfterMax60s > 25 && a.dropAfterMax60s < 35);
  assert.equal(a.resting, undefined); assert.equal(a.hrv, undefined);
});
test("analyze needs 2 rows", () => assert.throws(() => analyze([{ t: 0, bpm: 60 }])));
test("drop is null when file ends within 60s of the peak", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ t: i, bpm: 60 + i }));
  assert.equal(analyze(rows).dropAfterMax60s, null);
});
