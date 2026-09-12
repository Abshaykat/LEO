# L.E.O. Core (TypeScript)

Identity (owner + multi-user/family), permission, approval, audit, memory (versioned),
planner, execution, workflow, agent factory + supervisor, সব capability tool, ও একটাই
conversational entry point (text ও voice দুটোর জন্য)।

**পুরো প্রজেক্টের requirements-coverage report, architecture, সীমাবদ্ধতা — সব `../README.md`-তে।**

## চালানোর নিয়ম

```bash
npm install
export LEO_HOME="$(pwd)"
export LEO_BACKUP_KEY="আপনার-নিজের-secret-key"
npm run typecheck
npm test
```

`npm test` mock Ollama+voice server নিজে থেকেই চালু করে, সব `*.test.ts` ফাইল চালায়, ও শেষে
pass/fail summary দেয় (`scripts/run-tests.mjs`)। আগের zip-এ `npm run typecheck`/`npm test`
script package.json-এ ছিলই না — এবার সেটা ঠিক করা হয়েছে এবং **উভয় কমান্ড আসলেই চালিয়ে**
verify করা হয়েছে, শুধু সমতুল্য কিছু ধরে নেওয়া হয়নি।

## মূল entry point ব্যবহার

```ts
import { LeoRuntime } from "./runtime/leo-runtime.ts";
import { LeoVoiceSession } from "./runtime/leo-voice-session.ts";
import { LeoBrain } from "./orchestrator/leo-brain.ts";
import { OllamaAIProvider } from "./ai/ollama-provider.ts";
import { OwnerAuthenticator } from "./identity/owner-auth.ts";

const runtime = new LeoRuntime(new LeoBrain(new OllamaAIProvider()), ownerAuthenticator);

// লিখে কথা বলা
await runtime.process({ userMessage: "...", ownerAuthToken });

// মুখে কথা বলা — এক call-এই STT → plan/approve/execute → TTS
await new LeoVoiceSession(runtime).process({ audioBase64, ownerAuthToken });

// পরিবারের সদস্যের হয়ে — familyMemberId দিলেই scope+approval automatic
await runtime.process({ userMessage: "...", ownerAuthToken, familyMemberId });

// মনে রাখা ("remember...") — memory.create/update/list/search/delete, versioned
```
