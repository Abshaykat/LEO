from __future__ import annotations

from pathlib import Path

from leo_voice.stt import TranscriptionResult, TranscriberUnavailableError
from leo_voice.tts import SynthesisResult, SynthesizerUnavailableError
from leo_voice.speaker_id import IdentificationResult


class FakeTranscriber:
    def __init__(self, *, ready: bool = True, text: str = "hello from the fake transcriber"):
        self._ready = ready
        self._text = text
        self.last_audio_path: Path | None = None

    def is_ready(self) -> bool:
        return self._ready

    def load_error(self) -> str | None:
        return None if self._ready else "fake transcriber is intentionally not ready"

    def transcribe(self, audio_path: Path) -> TranscriptionResult:
        self.last_audio_path = audio_path
        if not self._ready:
            raise TranscriberUnavailableError(self.load_error() or "not ready")
        return TranscriptionResult(text=self._text, language="en", duration_seconds=1.23)


class FakeSynthesizer:
    def __init__(self, *, ready: bool = True, audio_bytes: bytes = b"FAKEWAVDATA"):
        self._ready = ready
        self._audio_bytes = audio_bytes
        self.last_text: str | None = None

    def is_ready(self) -> bool:
        return self._ready

    def load_error(self) -> str | None:
        return None if self._ready else "fake synthesizer is intentionally not ready"

    def synthesize(self, text: str) -> SynthesisResult:
        self.last_text = text
        if not self._ready:
            raise SynthesizerUnavailableError(self.load_error() or "not ready")
        return SynthesisResult(audio_bytes=self._audio_bytes, sample_rate=22050)


class FakeSpeakerIdentifier:
    def __init__(self, *, ready: bool = True, identify_result: IdentificationResult | None = None):
        self._ready = ready
        self._identify_result = identify_result
        self.enrolled: list[tuple[str, Path]] = []

    def is_ready(self) -> bool:
        return self._ready

    def enroll(self, member_id: str, audio_path: Path) -> None:
        self.enrolled.append((member_id, audio_path))

    def identify(self, audio_path: Path) -> IdentificationResult | None:
        return self._identify_result
