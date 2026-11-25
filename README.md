# Pulse Analysis

Two parts, one project:

1. **Browser analyzer** (`index.html`, `analysis.js`, `app.js`): upload or paste a CSV with the header `time_s,bpm`. It validates rows (reports skipped lines), removes impossible readings and sudden jumps, smooths with a rolling median, and reports samples, duration, lowest/average/highest bpm, time in zones, and the change 60 s after the highest reading. Runs in your browser; the file is not uploaded.
2. **Python version** (`pulse.py`): simulates a session and writes an HTML report. Standard library only.

## Run / test
```
node --test analysis.test.js      # browser logic
python3 -m unittest -v            # python version
python3 pulse.py                  # writes report.html
```

## Sign-in and saved summaries
Optional Google sign-in (Firebase, free plan). Only the numeric summary is saved, never the CSV, at `users/{uid}/pulse/`. Firestore rules allow only the signed-in owner. Each save is a new record, so two devices cannot overwrite each other.

## Limits
- It reads bpm numbers. It does not detect heartbeats from a camera or sensor.
- No resting heart rate, HRV or recovery scores and no health assessment. The "change 60 s after highest" figure is just a difference between two numbers.
- Max HR for zones is typed by you, not measured.
- Cleaning thresholds (35 to 210 bpm, 25 bpm jump, window 9) are simple defaults.
- The Python simulator's resting/HRV outputs apply only to its own generated data.
- Not medical advice.

## Credits
Built with AI assistance.
