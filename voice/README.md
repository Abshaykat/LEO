# L.E.O. Voice Interface — Whisper STT + Piper TTS (local-only)

সম্পূর্ণ local, offline voice service। কোনো audio বা text কখনো এই মেশিন ছেড়ে যায় না।

## এই sandbox-এ কী verify করা হয়েছে, কী হয়নি (সততার সাথে)

এই কোড **Claude-এর coding sandbox-এ** বানানো হয়েছে, যেখানে **network নেই** — তাই
`faster-whisper`/`piper-tts` install করা বা real model download করা সম্ভব হয়নি। যা সত্যিই
verify করা হয়েছে:

- ✅ পুরো service architecture (config, HTTP server, request validation, error handling) —
  **১৩টা Python test দিয়ে**, fake STT/TTS backend inject করে
- ✅ Real Python service **সত্যিই চালু** করে দেখা হয়েছে (`python -m leo_voice`), আর সেটা
  honestly "degraded" status রিপোর্ট করে যখন faster-whisper/piper installed না — কোনো crash
  হয় না, পরিষ্কার install-instruction সহ error দেয়
- ✅ TypeScript side (`voice.transcribe`, `voice.speak`, `voice.check_status`) real Python
  subprocess-এর সাথে সত্যিই কথা বলে verify করা হয়েছে (একটা genuine end-to-end integration
  test দিয়ে, mock না)
- ❌ **যা verify করা যায়নি:** real audio দিয়ে real transcription, বা real synthesized speech
  শোনা — এর জন্য faster-whisper/piper-tts install ও model download লাগবে, যেটা শুধু আপনার
  নিজের PC-তে (network থাকা অবস্থায়) সম্ভব।

## Setup (আপনার PC-তে)

```bash
cd voice
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

### Whisper model
প্রথমবার service চালু করলে `faster-whisper` নিজে থেকেই model download করে নেবে
(default: `base` model — আপনার hardware-এর জন্য balanced choice, `tiny` আরও হালকা/কম নির্ভুল,
`small` আরও ভালো নির্ভুলতা কিন্তু বেশি RAM/সময় লাগবে)। বদলাতে চাইলে:

```bash
set LEO_WHISPER_MODEL=tiny
```

### Piper voice model
Piper নিজে থেকে download করে না — [Piper releases](https://github.com/rhasspy/piper/releases)
বা [Piper voices](https://huggingface.co/rhasspy/piper-voices) থেকে একটা `.onnx` +
`.onnx.json` ফাইল জোড়া download করে এই path-এ রাখুন (অথবা env var দিয়ে override করুন):

```bash
set LEO_PIPER_MODEL_PATH=C:\LEO\workspace\voice-models\piper\voice.onnx
set LEO_PIPER_CONFIG_PATH=C:\LEO\workspace\voice-models\piper\voice.onnx.json
```

### চালানো

```bash
set LEO_HOME=C:\LEO
python -m leo_voice
```

`http://127.0.0.1:8765`-এ চালু হবে (শুধু localhost, বাইরের কেউ access করতে পারবে না)।
`/health` দেখে নিশ্চিত হন দুটো backend-ই ready কিনা।

## TypeScript core-এর সাথে সংযোগ

`core/tools/voice-tools.ts` স্বয়ংক্রিয়ভাবে `http://127.0.0.1:8765`-এ connect করে (env var
`LEO_VOICE_URL`/`LEO_VOICE_PORT` দিয়ে override করা যায়)। তিনটা tool এখন LEO-এর normal
plan→permission→execute→audit gate-এর ভিতর দিয়েই চলে, ঠিক অন্য সব tool-এর মতো:

- `voice.check_status` — backend ready কিনা (no approval — read-only)
- `voice.transcribe` — owner-এর audio → text (no approval — voice হলো একটা input modality,
  typing-এর মতোই, consequential action না)
- `voice.speak` — text → LEO-এর কণ্ঠস্বর (no approval — একই কারণে)

## Test চালানো

```bash
cd voice
python -m unittest discover -s tests -v
```

13/13 pass করা উচিত, fake backend দিয়ে — real model লাগে না।
