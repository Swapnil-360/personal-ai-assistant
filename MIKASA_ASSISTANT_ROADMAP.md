# ⚔️ Mikasa AI Assistant — Mobile Evolution Roadmap

This master roadmap organizes all upcoming capabilities from **Easy to Hard**. Every milestone includes permission gating, user control via Settings/Profile, and clear verification steps.

---

## 📊 Summary & Priority Tiers

| Tier | Category | Difficulty | Key Features | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1** | **Permission System & Settings Hub** | 🟢 Easy | In-App Permission Center, Microphone/Torch authorization gates, Visual status badges | ⏳ In Progress |
| **Tier 2** | **"Hey, Mikasa" Wake Word Engine** | 🟡 Medium | Profile toggle, Mic permission handshake, Wake word detection, Audio feedback | ⏳ Planned |
| **Tier 3** | **Hardware Controls & Deep Tools** | 🟠 Medium-Hard | Physical Camera Torch, Direct PC App Launcher, Sub-second Volume Keystroke sync | ⏳ Planned |
| **Tier 4** | **Background Autonomy & Smart Push** | 🔴 Hard | Background audio service, Expo push notifications, Autonomous proactive alerts | ⏳ Planned |

---

## 🟢 Tier 1: Permission Management & Settings Architecture (Easy)

### Objectives
Ensure every feature strictly adheres to OS permissions. If a permission is missing, the app explains why it is needed and prompts the user to grant it.

- [ ] **1.1 Dedicated Permissions Center in Profile/Settings Tab**
  - Add visual permission cards for:
    - 🎙️ **Microphone** (Required for Voice Commands & "Hey Mikasa" Wake Word)
    - 🔦 **Camera / Torch** (Required for Physical Flashlight)
    - 📍 **Location** (For local weather sitreps & prayer times)
  - Display status badges: `GRANTED` (Green), `DENIED` (Red), or `NOT REQUESTED` (Gray).
  - Include a one-tap **"Request Permission"** button for each item.

- [ ] **1.2 Graceful Permission Gates on Device Actions**
  - When tapping **Flashlight**, check camera/torch permission first. If not granted, request permission inline; if denied, show an alert with instructions to enable in Android settings.
  - When tapping the **Microphone** button, verify audio recording permissions before opening the audio session.

---

## 🟡 Tier 2: Hands-Free "Hey, Mikasa" Wake Word Engine (Medium)

### Objectives
Enable Mikasa to wake up naturally when you say **"Hey, Mikasa"** or **"Mikasa"**, exactly like Siri or Google Assistant, with full control in Settings.

- [ ] **2.1 Profile/Settings Enable/Disable Switch**
  - Add a toggle switch in Settings: **"Wake Word ('Hey, Mikasa')"**.
  - Persist toggle state using `AsyncStorage`.

- [ ] **2.2 Permission Handshake on Toggle**
  - When the user switches the toggle **ON**:
    1. App checks Microphone permission via `Audio.getPermissionsAsync()`.
    2. If not granted, triggers `Audio.requestPermissionsAsync()`.
    3. If granted: Activates the wake-word listener loop and displays a toast/indicator: *"Wake Word active. Listening for 'Hey Mikasa'..."*.
    4. If denied: Keeps the toggle **OFF** and alerts the user that microphone access is required for wake word detection.

- [ ] **2.3 Wake Word Detection & Trigger Loop**
  - When "Hey, Mikasa" is detected:
    - Trigger immediate haptic feedback (`Haptics.notificationAsync`).
    - Animate the orbital HUD ring to glowing cyan (`LISTENING`).
    - Mikasa responds verbally: *"Yes, Commander?"*.
    - Automatically start recording the user's voice command for 4-5 seconds.
    - Send voice audio/transcript to Mikasa backend (`/api/command`), receive AI response, and speak it aloud.

- [ ] **2.4 Resource Cleanup on Toggle OFF**
  - When switched **OFF**, immediately stop any recording/listening threads, release the microphone hardware, and return power consumption to zero.

---

## 🟠 Tier 3: Physical Hardware Controls & PC Quick Launchers (Medium-Hard)

### Objectives
Turn Mikasa Mobile into a true physical and digital Swiss Army Knife for Commander Swapnil.

- [ ] **3.1 Physical Camera Torch Integration**
  - Install and configure `expo-camera` torch mode.
  - Tapping **Flashlight** physically toggles the phone's rear LED flash with instantaneous tactile feedback.

- [ ] **3.2 Desktop App & Project Launchers**
  - Add one-tap launcher tiles in the **Actions** tab:
    - 💻 **Open VS Code** (Launches `d:\Projects\personal-ai-assistant` or CurricuRAG).
    - 🌐 **Open Edu51Portal** (Opens Chrome to student portal).
    - 📊 **Open Portfolio** (Opens `mrswapnil.me`).
    - ⚡ **Open Terminal / PowerShell**.

- [ ] **3.3 Continuous Workstation Latency & Network Sync**
  - Ping local PC bridge every 10 seconds; display live roundtrip ping (e.g. `12ms (LAN)`) on the Home header.

---

## 🔴 Tier 4: Background Autonomy & Proactive Notifications (Hard)

### Objectives
Allow Mikasa to run in the background and alert you without needing the app open on your screen.

- [ ] **4.1 Background Audio Listener on Android**
  - Configure Android foreground service with a persistent status notification (`Mikasa Guardian active`).
  - Allows "Hey, Mikasa" wake word to function when the screen is dimmed or while using other apps.

- [ ] **4.2 Proactive Push Notifications**
  - Push daily Morning Sitrep at 08:00 AM directly to your phone's notification bar.
  - Alert immediately if CurricuRAG or stark-os-portfolio receives a new GitHub commit or issue.
  - Alert if PC goes offline or comes back online.

---

## 🛠️ Verification & Testing Checklist

| Step | Action | Expected Result | Verified |
| :---: | :--- | :--- | :---: |
| 1 | Open Settings Tab | Permission Center shows Mic, Camera, Location status badges | [ ] |
| 2 | Tap "Grant Access" for Mic | Android OS permission dialog appears, status changes to GRANTED | [ ] |
| 3 | Enable "Hey, Mikasa" switch | Permission verified; listening indicator activates | [ ] |
| 4 | Speak "Hey, Mikasa" | Haptic triggers, Mikasa answers "Yes Commander?", listens to command | [ ] |
| 5 | Speak a command | Response speaks aloud via studio voice and displays in Chat | [ ] |
| 6 | Tap Flashlight button | Camera permission requested; phone LED flash physically lights up | [ ] |

---

## 🧠 Operational Milestone: Episodic Relational Memory Graph & Visual Explorer

**Status:** ✅ Operational (October 2026)  
**Spec:** `docs/EPISODIC_MEMORY_GRAPH_SPEC.md`

### Architecture & Capabilities:
- **Distributed Knowledge Mesh:** Native Supabase PostgreSQL relational schema with `memory_nodes` and `memory_edges` supporting temporal validity (`valid_from`, `valid_until`) to avoid destructive overwrites.
- **Asynchronous Ingestion Engine (`memory_graph_engine.js`):** Schema-constrained Gemini 2.5 Flash entity-relation extraction running strictly in the background with zero chat response latency.
- **Multi-Hop Traversal:** Instant 1-3 hop bidirectional graph walk returning connected projects, decisions, technologies, and personal preferences in `<15ms`.
- **AI Tool Integration (`tools_agent.js`):** `query_memory_graph` native tool registered for multi-turn cognitive reasoning.
- **Interactive Visual Explorer (`web/app.html`, `web/app.js`, `web/styles.css`):** Cyberpunk dark HUD canvas powered by Vis.js Network with label filters, search, node inspection drawer, and neighborhood focusing.

