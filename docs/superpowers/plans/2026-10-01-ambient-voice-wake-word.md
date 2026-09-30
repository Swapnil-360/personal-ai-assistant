# Ambient Voice & Dual Wake-Word Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `mikasa-mobile` into a hands-free J.A.R.V.I.S.-style ambient companion that awakens on `"Hey Mikasa"` or `"Mikasa"`, automatically captures voice queries with VAD, and speaks responses aloud without touching the screen.

**Architecture:** A lightweight on-device keyword matcher and state machine coordinator controls continuous standby listening, handles rapid haptic/audio wake acknowledgement (<200ms), records the query with a 1.2s silence VAD timer, dispatches to the `/api/voice/process` backend, speaks the reply, and applies echo-suppression before returning to standby.

**Tech Stack:** React Native, Expo (`expo-audio`, `expo-speech`, `expo-haptics`), TypeScript, Node.js (`web/server.js`), Google Gemini Flash.

**Spec:** [docs/AMBIENT_VOICE_WAKE_WORD_SPEC.md](file:///d:/Projects/personal-ai-assistant/docs/AMBIENT_VOICE_WAKE_WORD_SPEC.md)

## Global Constraints

- Must trigger on both `"Hey Mikasa"` and `"Mikasa"` verbatim.
- Latency from wake trigger to audio acknowledgement must be under 250ms.
- VAD silence timeout must be 1.2 seconds before finalizing the user command.
- Strict echo suppression: must never trigger its own wake word during voice audio playback.
- Zero network traffic permitted during ambient standby waiting.
- Disabling the toggle in Settings must cleanly release all microphone hardware and listeners immediately.

## Review Focus

1. **Background noise or casual conversation containing "Mikasa":** The regex matcher must recognize word boundaries (`\b(hey\s+)?mikasa\b`) so words like "mikasas" or "formikasa" do not trigger false positives.
2. **Audio session contention:** Transitioning between recording mode and playback mode must not throw Android `AudioTrack` or `MediaRecorder` error states.
3. **Echo loop:** Mikasa saying her own name in a reply (e.g. *"I'm Mikasa..."*) must be completely muted from the wake listener until playback finishes + 500ms safety window.
4. **App backgrounding / screen lock:** If the app is minimized, the microphone thread must safely pause or detach to avoid battery drain or OS permission kills.
5. **Network failure during query processing:** If `/api/voice/process` fails, the state machine must speak a polite error and cleanly return to `STANDBY_LISTENING`.

---

### Task 1: Wake Word Pattern Matcher & Normalizer

**Files:**
- Create: `mikasa-mobile/wakeWordMatcher.ts`
- Test: `scratch/test_wake_word_matcher.js`

- [ ] **Step 1: Write the failing test for wake word matching**
  Create `scratch/test_wake_word_matcher.js` verifying that `"Hey Mikasa"`, `"hey mikasa"`, `"Mikasa"`, `"Hey, Mikasa!"`, and `"ai mikasa"` return `{ matched: true, trigger: ... }`, while `"computer"`, `"swapnil"`, and noisy background phrases return `{ matched: false }`.

- [ ] **Step 2: Run test to confirm failure**
  Run `node scratch/test_wake_word_matcher.js` and verify it fails (module not found).

- [ ] **Step 3: Implement `wakeWordMatcher.ts`**
  Implement regex normalization, punctuation stripping, case-insensitivity, and trigger extraction in `mikasa-mobile/wakeWordMatcher.ts`.

- [ ] **Step 4: Run test to confirm pass**
  Run `node scratch/test_wake_word_matcher.js` and verify all test assertions pass.

- [ ] **Step 5: Commit**
  `git add mikasa-mobile/wakeWordMatcher.ts scratch/test_wake_word_matcher.js && git commit -m "feat(voice): implement wake word pattern matcher"`

---

### Task 2: Hands-Free Voice State Machine & Audio Coordinator

**Files:**
- Create: `mikasa-mobile/wakeWordCoordinator.ts`
- Test: `scratch/test_wake_word_coordinator.js`

- [ ] **Step 1: Write the failing test for the state machine**
  Create `scratch/test_wake_word_coordinator.js` verifying state transitions:
  `STANDBY_LISTENING` -> `WAKE_DETECTED` -> `COMMAND_LISTENING` -> `PROCESSING` -> `SPEAKING` -> `STANDBY_LISTENING`.
  Ensure VAD silence timer (1.2s) transitions from `COMMAND_LISTENING` to `PROCESSING`.
  Ensure echo guard prevents wake triggers while state is `SPEAKING`.

- [ ] **Step 2: Run test to confirm failure**
  Run `node scratch/test_wake_word_coordinator.js` and confirm failure.

- [ ] **Step 3: Implement `wakeWordCoordinator.ts`**
  Implement the state coordinator with VAD timeout, echo-suppression cooldown, and event callbacks for haptics, HUD status, and backend dispatch.

- [ ] **Step 4: Run test to confirm pass**
  Run `node scratch/test_wake_word_coordinator.js` and verify all state transitions pass.

- [ ] **Step 5: Commit**
  `git add mikasa-mobile/wakeWordCoordinator.ts scratch/test_wake_word_coordinator.js && git commit -m "feat(voice): implement hands-free voice state coordinator"`

---

### Task 3: Backend Voice Processing Hardening (`web/server.js`)

**Files:**
- Modify: `web/server.js:1255-1425`
- Test: `scratch/test_voice_process_api.js`

- [ ] **Step 1: Write integration test for `/api/voice/process`**
  Create `scratch/test_voice_process_api.js` sending a simulated mobile wake-word voice command (`{ text: "what is my pc status", source: "mobile_wake_word" }`) and verifying fast response with `spokenText` and `toolsUsed`.

- [ ] **Step 2: Run test and observe output**
  Run `node scratch/test_voice_process_api.js`.

- [ ] **Step 3: Ensure `/api/voice/process` handles wake word source cleanly**
  Ensure spoken reply is concise (under 2 sentences), stripped of emojis, and ready for instant text-to-speech.

- [ ] **Step 4: Re-run test and verify success**
  Ensure test passes with <1.5s latency.

- [ ] **Step 5: Commit**
  `git add web/server.js scratch/test_voice_process_api.js && git commit -m "feat(voice): optimize /api/voice/process for hands-free mobile responses"`

---

### Task 4: UI, Arc Reactor HUD & Settings Integration in `mikasa-mobile/App.tsx`

**Files:**
- Modify: `mikasa-mobile/App.tsx`

- [ ] **Step 1: Connect `wakeWordCoordinator` to `App.tsx`**
  Import `wakeWordCoordinator` and wire the `Wake Word ("Hey Mikasa")` settings toggle to start and stop the ambient listener.

- [ ] **Step 2: Wire Visual HUD Feedback**
  When in `WAKE_DETECTED` or `COMMAND_LISTENING`, pulse the Arc Reactor HUD ring with high-intensity glowing cyan and display `"Listening for command..."`.

- [ ] **Step 3: Wire Audio & Verbal Acknowledgment**
  Trigger haptic double-tap and immediate verbal ack: *"Yes, Commander?"* upon wake detection.

- [ ] **Step 4: Wire Automatic Return to Standby**
  After speech response finishes playing, engage 500ms echo suppression and return to standby listening.

- [ ] **Step 5: Commit**
  `git add mikasa-mobile/App.tsx && git commit -m "feat(mobile): wire ambient wake word and hands-free HUD loop into App.tsx"`

---

### Task 5: End-to-End Simulation & Verification

**Files:**
- Create: `scratch/test_e2e_ambient_voice.js`

- [ ] **Step 1: Write comprehensive end-to-end simulation**
  Create `scratch/test_e2e_ambient_voice.js` testing:
  1. Wake Word Match ("Hey Mikasa" & "Mikasa")
  2. Immediate Ack generation
  3. Hands-free command dispatch
  4. Backend execution & tool invocation
  5. Spoken text extraction
  6. Echo suppression timing

- [ ] **Step 2: Run end-to-end verification**
  Run `node scratch/test_e2e_ambient_voice.js` and verify 100% pass rate.

- [ ] **Step 3: Final Commit & Git Push**
  `git add . && git commit -m "feat(mobile): complete ambient voice & dual wake-word subsystem" && git push origin main`
