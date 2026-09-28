# 📱 MIKASA NATIVE MOBILE OS v2 — MASTER ARCHITECTURAL PLAN

> **Target Platform:** Pure Native React Native (Expo) `mikasa-mobile` + Web PWA Mirror  
> **Identity:** Autonomous Mobile Executive Copilot for **Md. Miftahur Rahman Swapnil**  
> **Core Mandate:** Premium Cyber-Military Luxury Aesthetics, Dual Workstation & Smartphone Hardware Control, Real-Time Phone Sensor Telemetry, and Zero Compromise UX.

---

## 🏛️ 1. Architecture: The Dual-Node Control Center

Mikasa Mobile is not merely a chat client or a web wrapper. It is a **dual-node operating copilot**:

```
                       ┌──────────────────────────────────────────────┐
                       │          SWAPNIL SMARTPHONE (Client)         │
                       │  • Battery Sensor    • Network / 4G / Wi-Fi  │
                       │  • Location / GPS    • Native Speech / TTS   │
                       │  • Haptics Engine    • Device Storage / RAM  │
                       └──────────────────────┬───────────────────────┘
                                              │
                         REST API + WebSocket │ (https://mikasa.mrswapnil.me)
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │          MIKASA CLOUD AGENT BRAIN            │
                       │  • Gemini Native Tool Calling (tools_agent)  │
                       │  • Supabase pgvector Long-Term Memory Vault  │
                       │  • Proactive Surveillance & Morning Sitrep   │
                       └──────────────────────┬───────────────────────┘
                                              │
                       Reverse SSH / Tunnel   │ (Swapnil-PC Coordinator)
                                              ▼
                       ┌──────────────────────────────────────────────┐
                       │       SWAPNIL-PC WORKSTATION (Host)          │
                       │  • Windows 11 Lock    • Master Volume Mute   │
                       │  • Terminal Agent     • Git Repos & Commits  │
                       │  • Display Power      • Local File System    │
                       └──────────────────────────────────────────────┘
```

---

## 🔐 2. Native Smartphone Hardware Permissions & Controls

Upon launch, Mikasa requests phone permissions to bridge with the phone hardware:

| Phone Subsystem | Expo Module | Capabilities & Autonomous Commands |
| :--- | :--- | :--- |
| **Battery & Power** | `expo-battery` | Monitors phone battery % and charging state. Warns when battery drops below 20%. |
| **Network & Cellular** | `expo-network` | Detects Wi-Fi vs 4G/5G mobile data, IP address, and airplane mode status. |
| **Device Telemetry** | `expo-device` | Identifies phone model (e.g. Xiaomi / Samsung), total RAM, OS version, and uptime. |
| **Voice Speech Output** | `expo-speech` | Reads responses aloud in clear natural voice directly from the phone speaker. |
| **Location & Geo** | `expo-location` | Queries current coordinates/city to feed live local weather into Morning Sitrep. |
| **Tactical Haptics** | `expo-haptics` | Heavy, medium, and success vibrations for hardware buttons and action confirmations. |
| **System Clipboard** | `expo-clipboard` | One-tap copying of terminal outputs, tokens, commit hashes, and notes. |

---

## 🎨 3. Design Overhaul: Cyber-Military Luxury Aesthetic

Eliminates the "cheap web-box" appearance in favor of an **ultra-premium native HUD**:

1. **Color Palette:**
   * **Deep Void:** `#030712` (pure OLED black for battery efficiency and high contrast).
   * **Surface Obsidian:** `rgba(15, 23, 42, 0.75)` with 0.5px hairline glowing borders (`rgba(56, 189, 248, 0.25)`).
   * **Primary Neon:** Electric Cyan (`#38bdf8`) & Mikasa Scarf Crimson (`#ef4444`).
   * **Telemetry Indicators:** Emerald Green (`#10b981`), Amber Warning (`#f59e0b`).
2. **Typography & Layout:**
   * Bold modern headings (`Plus Jakarta Sans` / System San Francisco / Roboto).
   * Monospace telemetry figures for clocks, latency, IP addresses, and percentages.
   * Dedicated tab views with **independent view stacking** to prevent visual bleed-through.

---

## 📱 4. Screen Architecture & Feature Roadmap

### 1. Header Cockpit
* **Dual Status Beacon:** Shows both **📱 Phone** (Battery %, Network) and **🖥️ PC** (Online, CPU %) in a high-density status pill.
* **Quick Hardware Action:** One-tap Lock PC (`Win + L`) with confirmation vibration.

### 2. Tab 1: Neural Chat HUD
* **Dynamic Sitrep Card:** High-contrast expandable briefing card showing live weather, pending tasks, recent commits, and battery alert.
* **Streamlined Chat Feed:** Clean message bubbles, code snippets, tool execution badges (`⚡ search_pc_files`, `⚡ check_service_health`).
* **Interactive Quick Chips:** Horizontal scroll of tactical commands.
* **Voice Integration:** Push-to-talk dictation + speaker icon to read responses aloud.

### 3. Tab 2: Dual Hardware Cockpit (Phone + PC)
* **Phone Hardware Telemetry:** Phone model, battery gauge, Wi-Fi/4G badge, location city.
* **Workstation Hardware Telemetry:** AMD Ryzen CPU load, 15.4GB RAM gauge, Drive C & D storage, active Windows application.
* **Tactical Control Grid:**
  * 🔒 Lock PC (`Win + L`)
  * 🔇 Toggle Master Audio Mute
  * 🔊 / 🔉 Precision Volume Increment/Decrement
  * ⏯️ Media Play/Pause
  * 💤 Power Down Displays

### 4. Tab 3: Neural Memory Vault
* **Search Engine:** Debounced live search filtering through all 123+ memories in real-time.
* **Pill Categorization:** Filter by *Facts*, *Preferences*, *Workflows*, *Decisions*, *Instructions*.
* **Memory Cards:** Clean cards with tag color-coding, importance badges, and timestamps.

### 5. Tab 4: Strategic Operations & Tasks
* **Active Tasks:** One-tap completion checkmark with instant local optimistic UI update and Supabase sync.
* **Task Creation:** Floating prompt to add tasks with priority tags.

### 6. Tab 5: Infrastructure & Service Monitors
* **Live Service Probing:** Real-time ping cards for `mrswapnil.me`, `mikasa.mrswapnil.me`, and local `n8n` workflow engine.
* **Telemetry Metrics:** Latency in milliseconds, HTTP status code (200 OK), and SSL validity.

---

## 🛠️ 5. Implementation Phases

1. **Phase 1: Native Phone Permissions & Hardware Packages**
   * Install `expo-battery`, `expo-device`, `expo-network`, `expo-speech`, `expo-clipboard`, `expo-location`.
   * Implement permission request flow on app startup.
2. **Phase 2: Core React Native Architecture (`mikasa-mobile/App.tsx`)**
   * Rebuild the entire UI with strict independent component screens.
   * Add Phone Hardware sensor polling and live telemetry display.
   * Implement real speech synthesis via `expo-speech`.
3. **Phase 3: Real-Time Cloud Synchronization**
   * Connect all endpoints directly to `https://mikasa.mrswapnil.me` with automatic master passkey auth.
   * Verify on phone via Expo Go hot-reloading.
