from __future__ import annotations

import os
import unittest
from pathlib import Path


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self._saved_env = dict(os.environ)

    def tearDown(self):
        os.environ.clear()
        os.environ.update(self._saved_env)
        # Ensure a fresh import picks up restored env on the next test.
        import sys
        sys.modules.pop("leo_voice.config", None)

    def test_defaults_are_rooted_under_leo_home(self):
        os.environ["LEO_HOME"] = "/tmp/leo-config-test-home"
        for key in ["LEO_VOICE_MODELS_DIR", "LEO_VOICE_PORT", "LEO_WHISPER_MODEL"]:
            os.environ.pop(key, None)

        from leo_voice.config import load_config

        config = load_config()
        self.assertEqual(config.leo_home, Path("/tmp/leo-config-test-home").resolve())
        self.assertTrue(str(config.whisper_model_dir).startswith(str(config.leo_home)))
        self.assertEqual(config.port, 8765)
        self.assertEqual(config.whisper_model_size, "base")

    def test_explicit_overrides_win(self):
        os.environ["LEO_HOME"] = "/tmp/leo-config-test-home"
        os.environ["LEO_VOICE_PORT"] = "9999"
        os.environ["LEO_WHISPER_MODEL"] = "small"

        from leo_voice.config import load_config

        config = load_config()
        self.assertEqual(config.port, 9999)
        self.assertEqual(config.whisper_model_size, "small")

    def test_only_listens_on_localhost_by_default(self):
        os.environ["LEO_HOME"] = "/tmp/leo-config-test-home"
        os.environ.pop("LEO_VOICE_HOST", None)

        from leo_voice.config import load_config

        config = load_config()
        self.assertEqual(config.host, "127.0.0.1")


if __name__ == "__main__":
    unittest.main()
