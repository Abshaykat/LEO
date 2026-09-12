"""Configuration for the L.E.O. local voice service.

Mirrors the TypeScript side's config/leo-config.ts pattern: everything is
driven by environment variables with sane defaults, rooted under LEO_HOME
so the voice service and the core TypeScript runtime agree on where things
live on disk.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _leo_home() -> Path:
    return Path(os.environ.get("LEO_HOME", os.getcwd())).resolve()


@dataclass(frozen=True)
class VoiceConfig:
    leo_home: Path
    host: str
    port: int
    whisper_model_size: str
    whisper_model_dir: Path
    whisper_compute_type: str
    piper_model_path: Path
    piper_config_path: Path
    speaker_profiles_path: Path
    max_audio_bytes: int
    max_text_chars: int


def load_config() -> VoiceConfig:
    leo_home = _leo_home()
    models_root = Path(os.environ.get("LEO_VOICE_MODELS_DIR", leo_home / "workspace" / "voice-models")).resolve()

    return VoiceConfig(
        leo_home=leo_home,
        host=os.environ.get("LEO_VOICE_HOST", "127.0.0.1"),
        port=int(os.environ.get("LEO_VOICE_PORT", "8765")),
        # "base" is the practical default for a CPU-only, 10GB-RAM machine:
        # noticeably more accurate than "tiny" while still usable without a GPU.
        whisper_model_size=os.environ.get("LEO_WHISPER_MODEL", "base"),
        whisper_model_dir=Path(os.environ.get("LEO_WHISPER_MODEL_DIR", models_root / "whisper")).resolve(),
        whisper_compute_type=os.environ.get("LEO_WHISPER_COMPUTE_TYPE", "int8"),
        piper_model_path=Path(
            os.environ.get("LEO_PIPER_MODEL_PATH", models_root / "piper" / "voice.onnx")
        ).resolve(),
        piper_config_path=Path(
            os.environ.get("LEO_PIPER_CONFIG_PATH", models_root / "piper" / "voice.onnx.json")
        ).resolve(),
        speaker_profiles_path=Path(
            os.environ.get("LEO_SPEAKER_PROFILES_PATH", models_root / "speaker-profiles.json")
        ).resolve(),
        max_audio_bytes=int(os.environ.get("LEO_VOICE_MAX_AUDIO_BYTES", str(25 * 1024 * 1024))),
        max_text_chars=int(os.environ.get("LEO_VOICE_MAX_TEXT_CHARS", "4000")),
    )
