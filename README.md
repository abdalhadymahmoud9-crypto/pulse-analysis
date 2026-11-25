# Pulse Analysis

A small Python project that analyses **simulated** heart-rate data and writes an HTML report. It shows how to clean noisy sensor data and measure what matters: resting rate, peak, time in zones, recovery after effort and heart rate variability (HRV).

No real person's data is used. This is a learning project and not medical advice.

## Run / test
```
python3 pulse.py          # writes report.html
python3 pulse.py 12       # different simulated session (seed 12)
python3 -m unittest -v
```
Python 3.8+, standard library only.

## What it does
1. `simulate`: one reading per second (rest, effort, recovery) with noise plus a few sensor glitches (0 and 230 bpm).
2. `remove_artifacts` and `smooth`: drop impossible values and sudden jumps, then a rolling median.
3. `summarise`: resting, peak and average bpm, time in each zone, 60-second recovery drop.
4. `rr_intervals`, `rmssd`, `sdnn`: beat-to-beat intervals and two standard HRV measures from the resting segment.
5. `build_report`: self-contained HTML with an SVG chart.

## Limits
Simulated signal only. Zones use a fixed max HR of 190. HRV intervals are generated from the bpm curve, so real recordings need a proper beat detector first.

## Credits
Built with AI assistance.
