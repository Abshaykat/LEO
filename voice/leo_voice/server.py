"""L.E.O. local voice service — HTTP server.

Exposes:
  GET  /health         -> backend readiness (never requires a body)
  POST /transcribe      -> multipart file "audio" -> {text, language, duration_seconds}
  POST /speak            -> JSON {"text": "..."} -> audio/wav bytes
  POST /voice/enroll      -> multipart file "audio" + form field "member_id" -> {enrolled: true}
  POST /voice/identify     -> multipart file "audio" -> {member_id, confidence} or {member_id: null}

Runs entirely on localhost. No audio, transcript, or synthesized speech
ever leaves the machine — this process only listens on LEO_VOICE_HOST
(127.0.0.1 by default).

⚠️  /voice/identify is ADVISORY ONLY (see speaker_id.py's module docstring).
The TypeScript side never treats its result as proof of identity for
permission/authorization purposes — only for personalization suggestions.
"""
from __future__ import annotations

import tempfile
from pathlib import Path

from flask import Flask, Response, jsonify, request

from .config import VoiceConfig
from .stt import Transcriber, TranscriberUnavailableError
from .tts import Synthesizer, SynthesizerUnavailableError
from .speaker_id import SpeakerIdentifier


def create_app(
    config: VoiceConfig,
    transcriber: Transcriber,
    synthesizer: Synthesizer,
    speaker_identifier: SpeakerIdentifier | None = None,
) -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = config.max_audio_bytes

    @app.get("/health")
    def health() -> Response:
        stt_ready = transcriber.is_ready()
        tts_ready = synthesizer.is_ready()
        speaker_id_ready = speaker_identifier.is_ready() if speaker_identifier else False
        return jsonify(
            {
                "status": "ok" if (stt_ready and tts_ready) else "degraded",
                "stt_ready": stt_ready,
                "tts_ready": tts_ready,
                "speaker_id_ready": speaker_id_ready,
                "stt_error": None if stt_ready else getattr(transcriber, "load_error", lambda: None)(),
                "tts_error": None if tts_ready else getattr(synthesizer, "load_error", lambda: None)(),
            }
        )

    @app.post("/transcribe")
    def transcribe() -> Response | tuple[Response, int]:
        if "audio" not in request.files:
            return jsonify({"error": "Missing 'audio' file in multipart form data."}), 400

        audio_file = request.files["audio"]
        if not audio_file.filename:
            return jsonify({"error": "Empty audio file."}), 400

        with tempfile.TemporaryDirectory(prefix="leo-voice-stt-") as tmp_dir:
            audio_path = Path(tmp_dir) / "input-audio"
            audio_file.save(audio_path)

            try:
                result = transcriber.transcribe(audio_path)
            except TranscriberUnavailableError as error:
                return jsonify({"error": str(error)}), 503

        return jsonify(
            {
                "text": result.text,
                "language": result.language,
                "duration_seconds": result.duration_seconds,
            }
        )

    @app.post("/speak")
    def speak() -> Response | tuple[Response, int]:
        body = request.get_json(silent=True) or {}
        text = body.get("text")

        if not isinstance(text, str) or not text.strip():
            return jsonify({"error": "'text' is required and must be a non-empty string."}), 400
        if len(text) > config.max_text_chars:
            return jsonify({"error": f"'text' exceeds the maximum of {config.max_text_chars} characters."}), 400

        try:
            result = synthesizer.synthesize(text)
        except SynthesizerUnavailableError as error:
            return jsonify({"error": str(error)}), 503

        return Response(result.audio_bytes, mimetype="audio/wav")

    @app.post("/voice/enroll")
    def enroll_speaker() -> Response | tuple[Response, int]:
        if speaker_identifier is None:
            return jsonify({"error": "Speaker identification is not configured on this server."}), 503

        member_id = request.form.get("member_id")
        if not member_id or not member_id.strip():
            return jsonify({"error": "'member_id' form field is required."}), 400
        if "audio" not in request.files or not request.files["audio"].filename:
            return jsonify({"error": "Missing 'audio' file in multipart form data."}), 400

        with tempfile.TemporaryDirectory(prefix="leo-voice-enroll-") as tmp_dir:
            audio_path = Path(tmp_dir) / "enroll-audio.wav"
            request.files["audio"].save(audio_path)
            try:
                speaker_identifier.enroll(member_id.strip(), audio_path)
            except ValueError as error:
                return jsonify({"error": str(error)}), 400

        return jsonify({"enrolled": True, "member_id": member_id.strip()})

    @app.post("/voice/identify")
    def identify_speaker() -> Response | tuple[Response, int]:
        if speaker_identifier is None:
            return jsonify({"error": "Speaker identification is not configured on this server."}), 503

        if "audio" not in request.files or not request.files["audio"].filename:
            return jsonify({"error": "Missing 'audio' file in multipart form data."}), 400

        with tempfile.TemporaryDirectory(prefix="leo-voice-identify-") as tmp_dir:
            audio_path = Path(tmp_dir) / "identify-audio.wav"
            request.files["audio"].save(audio_path)
            try:
                result = speaker_identifier.identify(audio_path)
            except ValueError as error:
                return jsonify({"error": str(error)}), 400

        if result is None:
            return jsonify({"member_id": None, "confidence": None})
        return jsonify({"member_id": result.member_id, "confidence": result.confidence})

    return app
