"""Entry point for the owner's real machine: `python -m leo_voice`.

Loads config from the environment, constructs the REAL faster-whisper and
Piper backends (not fakes), and starts the Flask server. If a backend
isn't ready (library not installed, or model files missing), the server
still starts — /health reports the problem clearly, and /transcribe or
/speak return a 503 with the same message rather than crashing the whole
process, since one missing model shouldn't take down the other capability.
"""
from __future__ import annotations

import sys

from .config import load_config
from .server import create_app
from .stt import FasterWhisperTranscriber
from .tts import PiperSynthesizer
from .speaker_id import SpectralFingerprintIdentifier


def main() -> None:
    config = load_config()

    transcriber = FasterWhisperTranscriber(
        model_size=config.whisper_model_size,
        model_dir=config.whisper_model_dir,
        compute_type=config.whisper_compute_type,
    )
    synthesizer = PiperSynthesizer(
        model_path=config.piper_model_path,
        config_path=config.piper_config_path,
    )
    speaker_identifier = SpectralFingerprintIdentifier(config.speaker_profiles_path)

    if not transcriber.is_ready():
        print(f"[leo_voice] STT not ready: {transcriber.load_error()}", file=sys.stderr)
    if not synthesizer.is_ready():
        print(f"[leo_voice] TTS not ready: {synthesizer.load_error()}", file=sys.stderr)

    app = create_app(config, transcriber, synthesizer, speaker_identifier)
    print(f"[leo_voice] Listening on http://{config.host}:{config.port}")
    app.run(host=config.host, port=config.port)


if __name__ == "__main__":
    main()
