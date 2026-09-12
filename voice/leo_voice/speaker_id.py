"""Speaker identification for L.E.O.'s voice interface.

⚠️  SECURITY NOTE — read before using this for anything beyond a greeting:
This module implements a lightweight, classical (non-ML) spectral
fingerprint — an averaged FFT magnitude profile compared by cosine
similarity. It is intentionally simple so it runs on a CPU-only, low-RAM
machine with no extra heavy dependencies (no torch, no downloaded speaker
model). It is a reasonable "who does this sound like" hint for
PERSONALIZATION (e.g. greeting the right household member by name) — it is
NOT secure biometric authentication. It can be fooled by a recording, a
similar-sounding voice, or a noisy room, and confidence scores are
relative, not calibrated probabilities. This is why identity/family-gate.ts
on the TypeScript side never accepts a speaker-ID result as proof of who
is requesting something — every actual permission decision still goes
through the real family-member-scope + owner-approval gate, keyed by an
explicit userId the owner has configured, not by a voice match.

A real deployment that wants stronger accuracy can swap in a proper
pretrained speaker-embedding model (e.g. speechbrain's ECAPA-TDNN,
resemblyzer) behind the same SpeakerIdentifier protocol — this module is
structured so that's a drop-in replacement, not a rewrite.
"""
from __future__ import annotations

import json
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import numpy as np


@dataclass(frozen=True)
class IdentificationResult:
    member_id: str
    confidence: float  # cosine similarity in [0, 1] against the best-matching enrolled profile
    method: str = "spectral_fingerprint_v1"


@dataclass
class SpeakerProfile:
    member_id: str
    embedding: list[float]
    enrolled_at: str


class SpeakerIdentifier(Protocol):
    def enroll(self, member_id: str, audio_path: Path) -> None: ...

    def identify(self, audio_path: Path) -> IdentificationResult | None: ...

    def is_ready(self) -> bool: ...


def _read_wav_as_float_mono(audio_path: Path) -> tuple[np.ndarray, int]:
    with wave.open(str(audio_path), "rb") as wav_file:
        n_channels = wav_file.getnchannels()
        sample_width = wav_file.getsampwidth()
        frame_rate = wav_file.getframerate()
        raw = wav_file.readframes(wav_file.getnframes())

    if sample_width != 2:
        raise ValueError(f"Only 16-bit PCM WAV is supported (got {sample_width * 8}-bit).")

    samples = np.frombuffer(raw, dtype=np.int16).astype(np.float64)
    if n_channels > 1:
        samples = samples.reshape(-1, n_channels).mean(axis=1)

    peak = np.max(np.abs(samples)) or 1.0
    return samples / peak, frame_rate


def _spectral_fingerprint(samples: np.ndarray, n_bins: int = 64, frame_size: int = 2048) -> list[float]:
    """Fixed-length spectral fingerprint: average FFT magnitude spectrum
    across overlapping frames, then bucket down to n_bins. Fixed-length
    regardless of clip duration, which is what makes two different-length
    recordings comparable by cosine similarity."""
    if len(samples) < frame_size:
        samples = np.pad(samples, (0, frame_size - len(samples)))

    hop = frame_size // 2
    window = np.hanning(frame_size)
    spectra = []
    for start in range(0, len(samples) - frame_size + 1, hop):
        frame = samples[start : start + frame_size] * window
        magnitude = np.abs(np.fft.rfft(frame))
        spectra.append(magnitude)

    if not spectra:
        spectra = [np.abs(np.fft.rfft(samples * np.hanning(len(samples))))]

    averaged = np.mean(spectra, axis=0)
    # Bucket the (frame_size/2 + 1)-length spectrum down to n_bins by
    # averaging contiguous chunks — coarser, more robust to small pitch/
    # timing differences between two recordings of the same voice.
    bucket_edges = np.linspace(0, len(averaged), n_bins + 1).astype(int)
    buckets = [
        float(averaged[bucket_edges[i] : bucket_edges[i + 1]].mean()) if bucket_edges[i + 1] > bucket_edges[i] else 0.0
        for i in range(n_bins)
    ]

    vector = np.array(buckets)
    norm = np.linalg.norm(vector) or 1.0
    return (vector / norm).tolist()


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.array(a), np.array(b)
    denom = (np.linalg.norm(va) * np.linalg.norm(vb)) or 1.0
    return float(np.dot(va, vb) / denom)


class SpectralFingerprintIdentifier:
    """Default, dependency-light SpeakerIdentifier. See module docstring
    for the (important) accuracy/security caveats."""

    def __init__(self, profiles_path: Path, match_threshold: float = 0.85):
        self._profiles_path = profiles_path
        self._match_threshold = match_threshold
        self._profiles: list[SpeakerProfile] = []
        self._load()

    def _load(self) -> None:
        if not self._profiles_path.exists():
            self._profiles = []
            return
        try:
            raw = json.loads(self._profiles_path.read_text(encoding="utf-8"))
            self._profiles = [SpeakerProfile(**entry) for entry in raw]
        except (json.JSONDecodeError, TypeError, KeyError):
            self._profiles = []

    def _save(self) -> None:
        self._profiles_path.parent.mkdir(parents=True, exist_ok=True)
        payload = [
            {"member_id": p.member_id, "embedding": p.embedding, "enrolled_at": p.enrolled_at} for p in self._profiles
        ]
        self._profiles_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def is_ready(self) -> bool:
        # This backend has no external model to load — it's always ready.
        return True

    def enroll(self, member_id: str, audio_path: Path) -> None:
        from datetime import datetime, timezone

        samples, _rate = _read_wav_as_float_mono(audio_path)
        embedding = _spectral_fingerprint(samples)

        self._profiles = [p for p in self._profiles if p.member_id != member_id]
        self._profiles.append(
            SpeakerProfile(member_id=member_id, embedding=embedding, enrolled_at=datetime.now(timezone.utc).isoformat())
        )
        self._save()

    def identify(self, audio_path: Path) -> IdentificationResult | None:
        if not self._profiles:
            return None

        samples, _rate = _read_wav_as_float_mono(audio_path)
        query = _spectral_fingerprint(samples)

        best: tuple[str, float] | None = None
        for profile in self._profiles:
            similarity = _cosine_similarity(query, profile.embedding)
            if best is None or similarity > best[1]:
                best = (profile.member_id, similarity)

        if best is None or best[1] < self._match_threshold:
            return None
        return IdentificationResult(member_id=best[0], confidence=round(best[1], 4))

    def enrolled_member_ids(self) -> list[str]:
        return [p.member_id for p in self._profiles]
