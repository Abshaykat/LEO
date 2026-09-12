from __future__ import annotations

import shutil
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from leo_voice.speaker_id import SpectralFingerprintIdentifier, _cosine_similarity, _spectral_fingerprint


def make_wav(path: Path, freq: float, seconds: float = 1.0, rate: int = 16000, noise: float = 0.0, seed: int = 0) -> None:
    """Generates a simple voice-like tone (fundamental + harmonics) as a 16-bit mono WAV."""
    rng = np.random.default_rng(seed)
    t = np.linspace(0, seconds, int(rate * seconds), endpoint=False)
    signal = 0.6 * np.sin(2 * np.pi * freq * t) + 0.3 * np.sin(2 * np.pi * 2 * freq * t) + 0.1 * np.sin(2 * np.pi * 3 * freq * t)
    if noise:
        signal = signal + rng.normal(0, noise, size=signal.shape)
    signal = signal / np.max(np.abs(signal))
    ints = (signal * 32767 * 0.9).astype(np.int16)
    with wave.open(str(path), "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(rate)
        wav_file.writeframes(ints.tobytes())


class SpectralFingerprintTests(unittest.TestCase):
    def setUp(self):
        self.tmp_dir = Path(tempfile.mkdtemp(prefix="leo-speaker-id-test-"))
        self.profiles_path = self.tmp_dir / "profiles.json"

    def tearDown(self):
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_is_always_ready_no_external_model_needed(self):
        identifier = SpectralFingerprintIdentifier(self.profiles_path)
        self.assertTrue(identifier.is_ready())

    def test_identifies_the_same_synthetic_voice_across_two_takes(self):
        voice_a_take1 = self.tmp_dir / "a1.wav"
        voice_a_take2 = self.tmp_dir / "a2.wav"
        make_wav(voice_a_take1, freq=120, seed=1)
        make_wav(voice_a_take2, freq=122, seed=2, noise=0.02)  # slightly different take

        identifier = SpectralFingerprintIdentifier(self.profiles_path)
        identifier.enroll("person_a", voice_a_take1)

        result = identifier.identify(voice_a_take2)
        self.assertIsNotNone(result)
        self.assertEqual(result.member_id, "person_a")
        self.assertGreater(result.confidence, 0.8)

    def test_distinguishes_two_different_synthetic_voices(self):
        voice_a = self.tmp_dir / "a.wav"
        voice_b = self.tmp_dir / "b.wav"
        make_wav(voice_a, freq=120, seed=1)
        make_wav(voice_b, freq=220, seed=3)

        identifier = SpectralFingerprintIdentifier(self.profiles_path)
        identifier.enroll("person_a", voice_a)
        identifier.enroll("person_b", voice_b)

        result_for_b = identifier.identify(voice_b)
        self.assertEqual(result_for_b.member_id, "person_b")

    def test_returns_none_for_an_unenrolled_voice(self):
        voice_a = self.tmp_dir / "a.wav"
        voice_unknown = self.tmp_dir / "unknown.wav"
        make_wav(voice_a, freq=120, seed=1)
        make_wav(voice_unknown, freq=340, seed=5)

        identifier = SpectralFingerprintIdentifier(self.profiles_path)
        identifier.enroll("person_a", voice_a)

        result = identifier.identify(voice_unknown)
        self.assertIsNone(result)

    def test_returns_none_when_nothing_is_enrolled_yet(self):
        identifier = SpectralFingerprintIdentifier(self.profiles_path)
        voice = self.tmp_dir / "a.wav"
        make_wav(voice, freq=150, seed=1)
        self.assertIsNone(identifier.identify(voice))

    def test_re_enrolling_the_same_member_replaces_their_profile(self):
        voice_old = self.tmp_dir / "old.wav"
        voice_new = self.tmp_dir / "new.wav"
        make_wav(voice_old, freq=120, seed=1)
        make_wav(voice_new, freq=280, seed=1)

        identifier = SpectralFingerprintIdentifier(self.profiles_path)
        identifier.enroll("person_a", voice_old)
        identifier.enroll("person_a", voice_new)  # re-enroll with a very different sample

        self.assertEqual(identifier.enrolled_member_ids(), ["person_a"])
        result = identifier.identify(voice_new)
        self.assertEqual(result.member_id, "person_a")

    def test_profiles_persist_across_instances_via_the_json_file(self):
        voice_a = self.tmp_dir / "a.wav"
        make_wav(voice_a, freq=120, seed=1)

        first = SpectralFingerprintIdentifier(self.profiles_path)
        first.enroll("person_a", voice_a)

        second = SpectralFingerprintIdentifier(self.profiles_path)
        self.assertEqual(second.enrolled_member_ids(), ["person_a"])

    def test_rejects_non_16bit_wav(self):
        # Write an 8-bit WAV to confirm it's rejected with a clear error rather than garbage results.
        path = self.tmp_dir / "eight_bit.wav"
        with wave.open(str(path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(1)
            wav_file.setframerate(8000)
            wav_file.writeframes(bytes([128] * 8000))

        identifier = SpectralFingerprintIdentifier(self.profiles_path)
        with self.assertRaises(ValueError):
            identifier.enroll("person_a", path)


class HelperFunctionTests(unittest.TestCase):
    def test_cosine_similarity_of_identical_vectors_is_one(self):
        vector = [0.1, 0.2, 0.3, 0.4]
        self.assertAlmostEqual(_cosine_similarity(vector, vector), 1.0, places=6)

    def test_cosine_similarity_of_orthogonal_vectors_is_zero(self):
        self.assertAlmostEqual(_cosine_similarity([1.0, 0.0], [0.0, 1.0]), 0.0, places=6)

    def test_fingerprint_has_the_requested_fixed_length_regardless_of_clip_length(self):
        short = np.random.default_rng(1).normal(0, 1, 4000)
        long = np.random.default_rng(1).normal(0, 1, 40000)
        self.assertEqual(len(_spectral_fingerprint(short, n_bins=32)), 32)
        self.assertEqual(len(_spectral_fingerprint(long, n_bins=32)), 32)


if __name__ == "__main__":
    unittest.main()
