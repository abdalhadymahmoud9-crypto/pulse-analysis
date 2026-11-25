import math
import unittest
import pulse


class PulseTests(unittest.TestCase):
    def test_simulation_is_repeatable(self):
        self.assertEqual(pulse.simulate(3), pulse.simulate(3))
        self.assertNotEqual(pulse.simulate(3), pulse.simulate(4))

    def test_artifacts_removed(self):
        raw = [70, 71, 0, 72, 230, 73, 74]
        clean = pulse.remove_artifacts(raw)
        self.assertEqual(clean, [70, 71, 71, 72, 72, 73, 74])

    def test_smooth_keeps_length_and_flattens_spike(self):
        out = pulse.smooth([60, 60, 90, 60, 60], window=3)
        self.assertEqual(len(out), 5)
        self.assertEqual(out[2], 60)

    def test_zones_add_up(self):
        z = pulse.zone_seconds([60, 120, 150, 175, 185], 190)
        self.assertEqual(sum(z.values()), 5)
        self.assertEqual(z["Rest"], 1)
        self.assertEqual(z["Max"], 2)

    def test_recovery_drop(self):
        bpm = [60, 100, 160] + [160 - i for i in range(1, 80)]
        self.assertEqual(pulse.recovery_drop(bpm, 60), 60.0)
        self.assertIsNone(pulse.recovery_drop([60, 100, 160], 60))

    def test_hrv_known_values(self):
        rr = [800, 810, 790, 800]
        self.assertAlmostEqual(pulse.rmssd(rr), math.sqrt((100 + 400 + 100) / 3))
        self.assertAlmostEqual(pulse.sdnn([800, 800, 800]), 0)

    def test_full_pipeline_is_plausible(self):
        s = pulse.summarise(pulse.smooth(pulse.remove_artifacts(pulse.simulate(7))))
        self.assertTrue(60 < s["resting_bpm"] < 76)
        self.assertTrue(150 < s["peak_bpm"] < 175)
        self.assertTrue(s["recovery_drop_60s"] > 20)

    def test_report_builds_and_escapes(self):
        page = pulse.build_report(7)
        self.assertIn("<svg", page)
        self.assertIn("Simulated data", page)


if __name__ == "__main__":
    unittest.main()
