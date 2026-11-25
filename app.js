import { parseCsv, analyze, ZONES } from "./analysis.js";
import { firebaseConfig } from "./firebase-config.js";
const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => Number(n).toFixed(d);
let last = null, uid = null, mods = null, unsub = null;

const SAMPLE = (() => { // generated in the browser, not a real person
  const r = ["time_s,bpm"]; let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647 - 0.5;
  for (let t = 0; t < 600; t++) {
    const b = t < 120 ? 68 : t < 360 ? 68 + 97 * (1 - Math.exp(-4 * (t - 120) / 240)) : 68 + 97 * (1 - Math.exp(-4)) * Math.exp(-(t - 360) / 60);
    let v = b + rnd() * 4;
    if (t === 90) v = 0; if (t === 200) v = 230; if (t === 450) v = 0;
    r.push(`${t},${v.toFixed(1)}`);
  }
  return r.join("\n");
})();

function chart(rows, clean) {
  const W = 760, H = 260, P = 36, n = rows.length, t0 = rows[0].t, t1 = rows[n - 1].t, lo = 40, hi = 200;
  const x = (t) => P + (t - t0) * (W - 2 * P) / ((t1 - t0) || 1);
  const y = (v) => H - P - (Math.min(Math.max(v, lo), hi) - lo) * (H - 2 * P) / (hi - lo);
  const pts = (f) => rows.map((r, i) => `${x(r.t).toFixed(1)},${y(f(i)).toFixed(1)}`).join(" ");
  const grid = [60, 100, 140, 180].map((v) => `<line x1="${P}" x2="${W - P}" y1="${y(v)}" y2="${y(v)}" stroke="#eee"/><text x="${P - 6}" y="${y(v) + 4}" font-size="10" text-anchor="end" fill="#777">${v}</text>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Heart rate over time. Grey is the raw file, red is cleaned.">${grid}<polyline points="${pts((i) => rows[i].bpm)}" fill="none" stroke="#ccc"/><polyline points="${pts((i) => clean[i])}" fill="none" stroke="#c21f35" stroke-width="2"/><text x="${P}" y="${H - 10}" font-size="10" fill="#777">${fmt(t0)} s</text><text x="${W - P}" y="${H - 10}" font-size="10" text-anchor="end" fill="#777">${fmt(t1)} s</text></svg>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function run(text, name) {
  $("msg").textContent = ""; $("out").hidden = true; last = null;
  const { rows, errors } = parseCsv(text);
  const maxHr = Number($("maxhr").value);
  if (!(maxHr >= 100 && maxHr <= 230)) { $("msg").textContent = "Max heart rate must be between 100 and 230."; return; }
  if (rows.length < 2) { $("msg").innerHTML = `<ul>${(errors.length ? errors : ["Need at least 2 valid rows."]).slice(0, 6).map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`; return; }
  const a = analyze(rows, maxHr);
  const warn = errors.length ? `<div>${errors.length} row(s) skipped:</div><ul>${errors.slice(0, 5).map((e) => `<li>${esc(e)}</li>`).join("")}${errors.length > 5 ? `<li>and ${errors.length - 5} more</li>` : ""}</ul>` : "";
  $("msg").innerHTML = warn;
  const k = (l, v) => `<div class="k"><small>${l}</small><b>${v}</b></div>`;
  $("kpis").innerHTML = k("Samples", a.samples) + k("Duration", fmt(a.durationS) + " s") + k("Lowest", fmt(a.minBpm) + " bpm") + k("Average", fmt(a.avgBpm) + " bpm") + k("Highest", fmt(a.maxBpm) + " bpm at " + fmt(a.maxAtS) + " s") +
    k("Change 60 s after highest", a.dropAfterMax60s === null ? "file too short" : fmt(a.dropAfterMax60s) + " bpm") + k("Readings corrected", a.artifactsRemoved);
  $("chart").innerHTML = chart(rows, a.clean);
  $("zones").innerHTML = ZONES.map(([n]) => `<tr><td>${n}</td><td>${fmt(a.zones[n])} s</td></tr>`).join("") + `<tr><td>Total</td><td>${fmt(Object.values(a.zones).reduce((x, y) => x + y, 0))} s</td></tr>`;
  $("zonenote").textContent = `Each reading counts for the time until the next one, using the real timestamps. The last reading has no next one, so it counts for the typical gap, which is why the total can be one gap longer than the ${fmt(a.durationS)} s duration.`;
  $("corr").innerHTML = a.corrected.length ? `<h2>Readings that were corrected (${a.corrected.length})</h2><p class="sub">These raw values were replaced with the previous good reading in the red line. They are outside 35 to 210 bpm or jumped more than 25 bpm, so a genuine fast change could be among them. The grey line still shows the raw file.</p><p>${a.corrected.slice(0, 12).map((c) => `${fmt(c.t, 1)} s: ${c.bpm} bpm`).map(esc).join("; ")}${a.corrected.length > 12 ? `; and ${a.corrected.length - 12} more` : ""}</p>` : "";
  $("out").hidden = false;
  const { clean, ...summary } = a;
  last = { ...summary, name: name || "pasted data", at: Date.now() };
  renderSave();
}

function renderSave() {
  const old = $("savebtn"); if (old) old.remove();
  if (!last || !uid) return;
  const b = document.createElement("button"); b.id = "savebtn"; b.type = "button"; b.className = "ghost"; b.textContent = "Save summary to my account";
  b.onclick = async () => { b.disabled = true; try { await save(last); b.textContent = "Saved"; } catch (e) { b.disabled = false; $("msg").textContent = "Could not save: " + (e.code || e.message); } };
  $("out").appendChild(b);
}

async function load() {
  if (mods) return mods;
  const B = "https://www.gstatic.com/firebasejs/11.0.2/";
  const [app, auth, fs] = await Promise.all([import(B + "firebase-app.js"), import(B + "firebase-auth.js"), import(B + "firebase-firestore.js")]);
  const a = app.initializeApp(firebaseConfig);
  return (mods = { auth, fs, au: auth.getAuth(a), db: fs.getFirestore(a) });
}
// Only the numeric summary is stored (never the raw CSV), at users/{uid}/pulse/{id}. Each save is a new document, so devices never overwrite each other.
async function save(s) { const m = await load(), { collection, addDoc } = m.fs; await addDoc(collection(m.db, "users", uid, "pulse"), { json: JSON.stringify(s), updatedAt: Date.now() }); }
async function del(id) { const m = await load(); await m.fs.deleteDoc(m.fs.doc(m.db, "users", uid, "pulse", id)); }

function watch(m) {
  const { collection, onSnapshot } = m.fs;
  unsub = onSnapshot(collection(m.db, "users", uid, "pulse"), (snap) => {
    const items = snap.docs.map((d) => { let j = {}; try { j = JSON.parse(d.data().json); } catch {} return { id: d.id, ...j }; }).sort((p, q) => (q.at || 0) - (p.at || 0));
    $("savedList").innerHTML = items.length ? `<table>${items.map((i) => `<tr><td>${esc(i.name)} <small style="color:#6b6b66">${new Date(i.at).toLocaleString()}</small><br>${fmt(i.minBpm)} to ${fmt(i.maxBpm)} bpm, avg ${fmt(i.avgBpm)}, ${fmt(i.durationS)} s</td><td><button class="ghost" data-del="${i.id}" aria-label="Delete saved summary">Delete</button></td></tr>`).join("")}</table>` : "<p class='sub'>Nothing saved yet.</p>";
    $("savedList").querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => del(b.dataset.del)));
  }, (e) => { $("savedList").textContent = "Could not load: " + (e.code || e.message); });
}

async function initAuth() {
  const m = await load();
  m.auth.onAuthStateChanged(m.au, (u) => {
    if (unsub) { unsub(); unsub = null; }
    uid = u ? u.uid : null;
    $("who").textContent = u ? u.displayName || u.email || "Signed in" : "";
    $("login").hidden = !!u; $("logout").hidden = !u; $("saved").hidden = !u;
    if (u) watch(m); else $("savedList").innerHTML = "";
    renderSave();
  });
  $("login").onclick = () => m.auth.signInWithPopup(m.au, new m.auth.GoogleAuthProvider()).catch((e) => ($("msg").textContent = "Sign-in failed: " + (e.code || e.message)));
  $("logout").onclick = () => m.auth.signOut(m.au);
}

$("go").onclick = () => run($("paste").value, "pasted data");
$("demo").onclick = () => { $("paste").value = SAMPLE; run(SAMPLE, "sample"); };
$("file").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  if (f.size > 1_000_000) { $("msg").textContent = "File is over 1 MB."; return; }
  const t = await f.text(); $("paste").value = ""; run(t, f.name);
};
initAuth().catch(() => { $("login").hidden = true; });
