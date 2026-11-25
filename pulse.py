"""Pulse analysis on SIMULATED heart-rate data (no real person's data, not medical advice).

Pipeline: simulate -> remove artifacts -> smooth -> summarise (resting, peak, zones,
recovery) -> HRV from RR intervals -> HTML report with an SVG chart.
Standard library only.
"""
import html
import math
import random
import statistics
import sys

# ---------- simulation ----------
def simulate(seed=7, rest_s=120, exercise_s=240, recovery_s=180, max_hr=165, rest_hr=68):
    """One bpm sample per second: rest, effort ramp, effort plateau, recovery. Adds noise and a few sensor glitches."""
    rng = random.Random(seed)
    total = rest_s + exercise_s + recovery_s
    out = []
    for t in range(total):
        if t < rest_s:
            base = rest_hr
        elif t < rest_s + exercise_s:
            x = (t - rest_s) / exercise_s
            base = rest_hr + (max_hr - rest_hr) * (1 - math.exp(-4 * x))
        else:
            peak = rest_hr + (max_hr - rest_hr) * (1 - math.exp(-4))
            x = (t - rest_s - exercise_s) / 40.0
            base = rest_hr + (peak - rest_hr) * math.exp(-x)
        out.append(base + rng.gauss(0, 1.5))
    for _ in range(4):  # sensor glitches: dropouts and spikes
        i = rng.randrange(10, total - 10)
        out[i] = rng.choice([0.0, 230.0])
    return out

# ---------- cleaning ----------
def remove_artifacts(bpm, low=35, high=210, max_jump=25):
    """Replace impossible values or sudden jumps with the previous good value."""
    clean, last = [], None
    for v in bpm:
        bad = v < low or v > high or (last is not None and abs(v - last) > max_jump)
        if bad:
            clean.append(last if last is not None else statistics.median(bpm))
        else:
            clean.append(v)
            last = v
    return clean

def smooth(values, window=9):
    """Centered rolling median."""
    half = window // 2
    return [statistics.median(values[max(0, i - half): i + half + 1]) for i in range(len(values))]

# ---------- summary ----------
ZONES = [("Rest", 0.0, 0.60), ("Light", 0.60, 0.70), ("Moderate", 0.70, 0.80), ("Hard", 0.80, 0.90), ("Max", 0.90, 9.9)]

def zone_seconds(bpm, max_hr):
    """Seconds spent in each zone, as a fraction of max heart rate."""
    out = {z[0]: 0 for z in ZONES}
    for v in bpm:
        for name, lo, hi in ZONES:
            if lo <= v / max_hr < hi:
                out[name] += 1
                break
    return out

def recovery_drop(bpm, window=60):
    """Beats-per-minute drop in the `window` seconds after the peak. Bigger usually means faster recovery."""
    peak_i = max(range(len(bpm)), key=lambda i: bpm[i])
    if peak_i + window >= len(bpm):
        return None
    return round(bpm[peak_i] - bpm[peak_i + window], 1)

def summarise(bpm, max_hr=190):
    rest_window = bpm[: max(30, len(bpm) // 10)]
    return {
        "resting_bpm": round(statistics.mean(rest_window), 1),
        "peak_bpm": round(max(bpm), 1),
        "average_bpm": round(statistics.mean(bpm), 1),
        "recovery_drop_60s": recovery_drop(bpm),
        "zones": zone_seconds(bpm, max_hr),
    }

# ---------- HRV ----------
def rr_intervals(bpm, seed=1):
    """Turn a bpm curve into beat-to-beat intervals (ms), with small natural variation."""
    rng = random.Random(seed)
    rr, t = [], 0.0
    while int(t) < len(bpm):
        interval = 60000.0 / bpm[int(t)]
        interval *= 1 + rng.gauss(0, 0.02)
        rr.append(interval)
        t += interval / 1000.0
    return rr

def sdnn(rr):
    return statistics.stdev(rr) if len(rr) > 1 else 0.0

def rmssd(rr):
    if len(rr) < 2:
        return 0.0
    d = [(b - a) ** 2 for a, b in zip(rr, rr[1:])]
    return math.sqrt(sum(d) / len(d))

# ---------- report ----------
def svg_chart(raw, clean, width=760, height=260, pad=36):
    n = len(raw)
    lo, hi = 40, 180
    x = lambda i: pad + i * (width - 2 * pad) / (n - 1)
    y = lambda v: height - pad - (min(max(v, lo), hi) - lo) * (height - 2 * pad) / (hi - lo)
    pts = lambda s: " ".join(f"{x(i):.1f},{y(v):.1f}" for i, v in enumerate(s))
    grid = "".join(
        f'<line x1="{pad}" x2="{width - pad}" y1="{y(v):.1f}" y2="{y(v):.1f}" stroke="#eee"/>'
        f'<text x="{pad - 6}" y="{y(v) + 4:.1f}" font-size="10" text-anchor="end" fill="#999">{v}</text>'
        for v in range(60, 181, 40))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="100%" role="img" aria-label="Heart rate over time">'
            f'{grid}<polyline points="{pts(raw)}" fill="none" stroke="#ddd" stroke-width="1"/>'
            f'<polyline points="{pts(clean)}" fill="none" stroke="#d6293e" stroke-width="2"/>'
            f'<text x="{pad}" y="{height - 10}" font-size="10" fill="#999">0 s</text>'
            f'<text x="{width - pad}" y="{height - 10}" font-size="10" text-anchor="end" fill="#999">{n} s</text></svg>')

def build_report(seed=7):
    raw = simulate(seed)
    clean = smooth(remove_artifacts(raw))
    s = summarise(clean)
    rr = rr_intervals(clean[:120])  # HRV from the resting segment
    rows = "".join(f"<tr><td>{html.escape(k)}</td><td>{v} s</td></tr>" for k, v in s["zones"].items())
    return f"""<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pulse analysis (simulated)</title>
<style>body{{font:15px/1.5 -apple-system,Segoe UI,system-ui,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;color:#171717}}
h1{{font-size:1.3rem}}p.note{{color:#8a8a85}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px;margin:24px 0}}
.k{{border-top:1px solid #171717;padding-top:8px}}.k small{{color:#8a8a85;display:block}}.k b{{font-size:1.6rem;font-weight:300}}
table{{border-collapse:collapse;width:100%}}td{{padding:6px 0;border-top:1px solid #e7e7e3}}td+td{{text-align:right}}</style>
<h1>Pulse analysis</h1><p class="note">Simulated data (seed {seed}). Grey line is the raw sensor signal with glitches, red is cleaned and smoothed. Not medical advice and not a fitness or health assessment.</p>
<div class="grid">
<div class="k"><small>Resting</small><b>{s['resting_bpm']} bpm</b></div>
<div class="k"><small>Peak</small><b>{s['peak_bpm']} bpm</b></div>
<div class="k"><small>Drop in the 60 s after peak</small><b>{s['recovery_drop_60s']} bpm</b></div>
<div class="k"><small>Resting HRV (RMSSD)</small><b>{rmssd(rr):.0f} ms</b></div></div>
{svg_chart(raw, clean)}
<h2 style="font-size:.8rem;text-transform:uppercase;letter-spacing:.1em;color:#8a8a85">Time in zone (max HR 190)</h2><table>{rows}</table></html>"""

if __name__ == "__main__":
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 7
    with open("report.html", "w", encoding="utf-8") as f:
        f.write(build_report(seed))
    clean = smooth(remove_artifacts(simulate(seed)))
    print(summarise(clean))
    print("Wrote report.html")
