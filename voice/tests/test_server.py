from __future__ import annotations

import io
import json
import unittest
from pathlib import Path

from leo_voice.config import VoiceConfig
from leo_voice.server import create_app
from leo_voice.speaker_id import IdentificationResult
from tests.fakes import FakeSpeakerIdentifier, FakeSynthesizer, FakeTranscriber


def make_config(**overrides) -> VoiceConfig:
    defaults = dict(
        leo_home=Path("/tmp/leo-voice-test-home"),
        host="127.0.0.1",
        port=8765,
        whisper_model_size="base",
        whisper_model_dir=Path("/tmp/leo-voice-test-home/whisper"),
        whisper_compute_type="int8",
        piper_model_path=Path("/tmp/leo-voice-test-home/piper/voice.onnx"),
        piper_config_path=Path("/tmp/leo-voice-test-home/piper/voice.onnx.json"),
        speaker_profiles_path=Path("/tmp/leo-voice-test-home/speaker-profiles.json"),
        max_audio_bytes=25 * 1024 * 1024,
        max_text_chars=4000,
    )
    defaults.update(overrides)
    return VoiceConfig(**defaults)


class HealthEndpointTests(unittest.TestCase):
    def test_reports_ok_when_both_backends_ready(self):
        app = create_app(make_config(), FakeTranscriber(ready=True), FakeSynthesizer(ready=True))
        response = app.test_client().get("/health")
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["status"], "ok")
        self.assertTrue(body["stt_ready"])
        self.assertTrue(body["tts_ready"])

    def test_reports_degraded_and_the_real_error_when_a_backend_is_not_ready(self):
        app = create_app(make_config(), FakeTranscriber(ready=False), FakeSynthesizer(ready=True))
        response = app.test_client().get("/health")
        body = response.get_json()
        self.assertEqual(body["status"], "degraded")
        self.assertFalse(body["stt_ready"])
        self.assertIsNotNone(body["stt_error"])


class TranscribeEndpointTests(unittest.TestCase):
    def test_transcribes_uploaded_audio_successfully(self):
        transcriber = FakeTranscriber(text="ami bhalo achi")
        app = create_app(make_config(), transcriber, FakeSynthesizer())
        response = app.test_client().post(
            "/transcribe",
            data={"audio": (io.BytesIO(b"fake wav bytes"), "clip.wav")},
            content_type="multipart/form-data",
        )
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["text"], "ami bhalo achi")
        self.assertEqual(body["language"], "en")
        self.assertIsNotNone(transcriber.last_audio_path)

    def test_missing_audio_file_is_a_clean_400(self):
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer())
        response = app.test_client().post("/transcribe", data={}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 400)
        self.assertIn("error", response.get_json())

    def test_unready_backend_returns_503_not_a_crash(self):
        app = create_app(make_config(), FakeTranscriber(ready=False), FakeSynthesizer())
        response = app.test_client().post(
            "/transcribe",
            data={"audio": (io.BytesIO(b"x"), "clip.wav")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 503)
        self.assertIn("error", response.get_json())


class SpeakEndpointTests(unittest.TestCase):
    def test_synthesizes_text_successfully(self):
        synthesizer = FakeSynthesizer(audio_bytes=b"REALFAKEWAV")
        app = create_app(make_config(), FakeTranscriber(), synthesizer)
        response = app.test_client().post(
            "/speak", data=json.dumps({"text": "hello"}), content_type="application/json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, b"REALFAKEWAV")
        self.assertEqual(response.mimetype, "audio/wav")
        self.assertEqual(synthesizer.last_text, "hello")

    def test_empty_text_is_a_clean_400(self):
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer())
        response = app.test_client().post(
            "/speak", data=json.dumps({"text": "   "}), content_type="application/json"
        )
        self.assertEqual(response.status_code, 400)

    def test_missing_text_field_is_a_clean_400(self):
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer())
        response = app.test_client().post("/speak", data=json.dumps({}), content_type="application/json")
        self.assertEqual(response.status_code, 400)

    def test_text_over_the_limit_is_rejected(self):
        app = create_app(make_config(max_text_chars=10), FakeTranscriber(), FakeSynthesizer())
        response = app.test_client().post(
            "/speak",
            data=json.dumps({"text": "this is definitely more than ten characters"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unready_backend_returns_503_not_a_crash(self):
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer(ready=False))
        response = app.test_client().post(
            "/speak", data=json.dumps({"text": "hello"}), content_type="application/json"
        )
        self.assertEqual(response.status_code, 503)


class SpeakerIdentificationEndpointTests(unittest.TestCase):
    def test_health_reports_speaker_id_not_ready_when_not_configured(self):
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer())  # no speaker_identifier passed
        response = app.test_client().get("/health")
        self.assertFalse(response.get_json()["speaker_id_ready"])

    def test_health_reports_speaker_id_ready_when_configured(self):
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer(), FakeSpeakerIdentifier(ready=True))
        response = app.test_client().get("/health")
        self.assertTrue(response.get_json()["speaker_id_ready"])

    def test_enroll_without_speaker_identifier_configured_is_503(self):
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer())
        response = app.test_client().post(
            "/voice/enroll",
            data={"member_id": "rafi", "audio": (io.BytesIO(b"x"), "clip.wav")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 503)

    def test_enroll_requires_member_id(self):
        identifier = FakeSpeakerIdentifier()
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer(), identifier)
        response = app.test_client().post(
            "/voice/enroll",
            data={"audio": (io.BytesIO(b"x"), "clip.wav")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(identifier.enrolled, [])

    def test_enroll_requires_audio_file(self):
        identifier = FakeSpeakerIdentifier()
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer(), identifier)
        response = app.test_client().post(
            "/voice/enroll", data={"member_id": "rafi"}, content_type="multipart/form-data"
        )
        self.assertEqual(response.status_code, 400)

    def test_enroll_success_calls_the_identifier(self):
        identifier = FakeSpeakerIdentifier()
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer(), identifier)
        response = app.test_client().post(
            "/voice/enroll",
            data={"member_id": "rafi", "audio": (io.BytesIO(b"fake wav bytes"), "clip.wav")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json(), {"enrolled": True, "member_id": "rafi"})
        self.assertEqual(len(identifier.enrolled), 1)
        self.assertEqual(identifier.enrolled[0][0], "rafi")

    def test_identify_returns_a_match(self):
        identifier = FakeSpeakerIdentifier(identify_result=IdentificationResult(member_id="rafi", confidence=0.93))
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer(), identifier)
        response = app.test_client().post(
            "/voice/identify",
            data={"audio": (io.BytesIO(b"fake wav bytes"), "clip.wav")},
            content_type="multipart/form-data",
        )
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["member_id"], "rafi")
        self.assertEqual(body["confidence"], 0.93)

    def test_identify_returns_null_member_when_no_match(self):
        identifier = FakeSpeakerIdentifier(identify_result=None)
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer(), identifier)
        response = app.test_client().post(
            "/voice/identify",
            data={"audio": (io.BytesIO(b"fake wav bytes"), "clip.wav")},
            content_type="multipart/form-data",
        )
        body = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(body["member_id"])

    def test_identify_without_speaker_identifier_configured_is_503(self):
        app = create_app(make_config(), FakeTranscriber(), FakeSynthesizer())
        response = app.test_client().post(
            "/voice/identify",
            data={"audio": (io.BytesIO(b"x"), "clip.wav")},
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 503)


if __name__ == "__main__":
    unittest.main()
