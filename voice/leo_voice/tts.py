"""Text-to-speech backend for the L.E.O. voice service.

Uses Piper (ONNX-based, CPU-friendly, fully offline) — the same choice
discussed and agreed on for a low-spec, no-GPU, local-only machine.

Like stt.py, the real backend is imported lazily so the rest of the
service (config, HTTP handling, validation) works even before `piper-tts`
is installed and a voice model is downloaded.
"""
from __future__ import annotations

import io
import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class SynthesisResult:
    audio_bytes: bytes
    sample_rate: int
    format: str = "wav"


class Synthesizer(Protocol):
    def synthesize(self, text: str) -> SynthesisResult: ...

    def is_ready(self) -> bool: ...


class SynthesizerUnavailableError(RuntimeError):
    """Raised when speech synthesis is requested but no real backend is ready."""


class PiperSynthesizer:
    """Real backend. Requires `pip install piper-tts` and a downloaded
    .onnx voice model + its matching .onnx.json config file."""

    def __init__(self, model_path: Path, config_path: Path) -> None:
        self._model_path = model_path
        self._config_path = config_path
        self._voice = None
        self._load_error: str | None = None
        self._try_load()

    def _try_load(self) -> None:
        try:
            from piper import PiperVoice  # type: ignore
        except ImportError as error:
            self._load_error = f"piper-tts is not installed. Run: pip install piper-tts (original error: {error})"
            return

        if not self._model_path.exists() or not self._config_path.exists():
            self._load_error = (
                f"Piper voice model not found at {self._model_path} "
                f"(and/or config at {self._config_path}). Download a voice from "
                "https://github.com/rhasspy/piper/releases and set LEO_PIPER_MODEL_PATH."
            )
            return

        try:
            self._voice = PiperVoice.load(str(self._model_path), config_path=str(self._config_path))
        except Exception as error:  # noqa: BLE001 — surfaced via is_ready()/synthesize()
            self._load_error = f"Failed to load Piper voice: {error}"

    def is_ready(self) -> bool:
        return self._voice is not None

    def load_error(self) -> str | None:
        return self._load_error

    def synthesize(self, text: str) -> SynthesisResult:
        if self._voice is None:
            raise SynthesizerUnavailableError(self._load_error or "Piper voice is not loaded.")

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav_file:
            self._voice.synthesize(text, wav_file)
        sample_rate = getattr(self._voice.config, "sample_rate", 22050)
        return SynthesisResult(audio_bytes=buffer.getvalue(), sample_rate=sample_rate)
