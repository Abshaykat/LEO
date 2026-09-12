"""Speech-to-text backend for the L.E.O. voice service.

Uses faster-whisper (CTranslate2-based) rather than the original openai
Whisper package because it runs meaningfully faster on CPU-only hardware —
relevant given the target machine (i7-4770K, no dedicated GPU, 10GB RAM).

The real backend is imported lazily (inside __init__) so that importing
this module — and therefore the server, config, and request-handling code
around it — never fails just because faster-whisper isn't installed yet.
That lets the surrounding service logic be built, wired, and tested before
the actual model/library is present on a given machine.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


@dataclass(frozen=True)
class TranscriptionResult:
    text: str
    language: str | None
    duration_seconds: float | None


class Transcriber(Protocol):
    def transcribe(self, audio_path: Path) -> TranscriptionResult: ...

    def is_ready(self) -> bool: ...


class TranscriberUnavailableError(RuntimeError):
    """Raised when transcription is requested but no real backend is ready."""


class FasterWhisperTranscriber:
    """Real backend. Requires `pip install faster-whisper` and a downloaded
    model (first run downloads it automatically into whisper_model_dir if
    network access is available on the owner's machine)."""

    def __init__(self, model_size: str, model_dir: Path, compute_type: str) -> None:
        self._model_size = model_size
        self._model_dir = model_dir
        self._compute_type = compute_type
        self._model = None
        self._load_error: str | None = None
        self._try_load()

    def _try_load(self) -> None:
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as error:
            self._load_error = (
                "faster-whisper is not installed. Run: pip install faster-whisper "
                f"(original error: {error})"
            )
            return

        try:
            self._model_dir.mkdir(parents=True, exist_ok=True)
            self._model = WhisperModel(
                self._model_size,
                device="cpu",
                compute_type=self._compute_type,
                download_root=str(self._model_dir),
            )
        except Exception as error:  # noqa: BLE001 — surfaced via is_ready()/transcribe()
            self._load_error = f"Failed to load Whisper model '{self._model_size}': {error}"

    def is_ready(self) -> bool:
        return self._model is not None

    def load_error(self) -> str | None:
        return self._load_error

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        if self._model is None:
            raise TranscriberUnavailableError(self._load_error or "Whisper model is not loaded.")

        segments, info = self._model.transcribe(str(audio_path))
        text = " ".join(segment.text.strip() for segment in segments).strip()
        return TranscriptionResult(
            text=text,
            language=getattr(info, "language", None),
            duration_seconds=getattr(info, "duration", None),
        )
