# 📱 Mikasa Assistant — Mobile Application Architecture & REST API Specification

> **Target Platforms:** React Native (Expo) / Flutter / Progressive Web App (PWA) / iOS & Android Native  
> **Backend Host:** `https://mikasa.mrswapnil.me` (Production) / `http://localhost:3000` (Local Dev)  
> **Auth Scheme:** Bearer Token via `Authorization: Bearer <TOKEN>` or `x-commander-token: <TOKEN>`

---

## 🏛️ Mobile Architecture Overview

```mermaid
flowchart TD
    subgraph Mobile_App [Mobile Client: React Native / Flutter / PWA]
        AUTH_SCR[1. Auth Screen / Passkey / Biometrics]
        CHAT_SCR[2. Neural Chat HUD & Push-to-Talk Voice]
        REMOTE_SCR[3. Workstation Remote Cockpit]
        MEMORY_SCR[4. Memory Vault & Search]
        TASKS_SCR[5. Tasks, Reminders & Sitrep]
    end

    subgraph API_Gateway [Mikasa Cloud / PC Server]
        AUTH_EP[/api/auth/login & /verify]
        CHAT_EP[/api/chat]
        PC_EP[/api/pc/* Lock, Volume, Media, Monitors]
        MEM_EP[/api/memories & /stats]
        TASK_EP[/api/tasks & /reminders]
    end

    subgraph External_Engines [Autonomous Brain & DB]
        GEMINI[Gemini Flash + OpenRouter Failover]
        SUPABASE[(Supabase Cloud DB & pgvector)]
        PC_HARDWARE[Windows 11 Workstation via local_pc_bridge]
    end

    AUTH_SCR --> AUTH_EP
    CHAT_SCR --> CHAT_EP
    REMOTE_SCR --> PC_EP
    MEMORY_SCR --> MEM_EP
    TASKS_SCR --> TASK_EP

    CHAT_EP --> GEMINI
    MEM_EP --> SUPABASE
    TASK_EP --> SUPABASE
    PC_EP --> PC_HARDWARE
```

---

## 🔑 Authentication

### 1. Commander Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "password": "YOUR_COMMANDER_PASSKEY"
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "access_token": "eyJhbGciOi...",
  "role": "commander",
  "expires_in": 2592000
}
```

### 2. Verify Session
```http
GET /api/auth/verify
Authorization: Bearer <access_token>
```
**Response (200 OK):**
```json
{
  "authenticated": true,
  "role": "commander",
  "name": "Swapnil"
}
```

---

## 💬 Real-Time Conversational AI

### Send Message
```http
POST /api/chat
Content-Type: application/json
Authorization: Bearer <access_token>

{
  "message": "amr pc theke CV pathao",
  "conversation_id": "mobile-session-01",
  "voice_reply": false
}
```
**Response (200 OK):**
```json
{
  "reply": "Swapnil, I found your latest resume in D:\\Swapnil\\CV\\Swapnil-Resume.pdf and sent it over. 🧣",
  "engine": "gemini-3.5-flash-lite",
  "tools_used": [
    {
      "tool": "search_pc_files",
      "args": { "query": "CV", "limit": 2 }
    }
  ]
}
```

---

## 🖥️ Workstation Remote Hardware Controls

All endpoints require Commander auth token:

| Action | Endpoint | Method | Payload |
| :--- | :--- | :--- | :--- |
| **Lock PC** | `/api/pc/lock` | `POST` | `{}` |
| **Mute Volume** | `/api/pc/volume` | `POST` | `{"direction": "mute"}` |
| **Volume Up** | `/api/pc/volume` | `POST` | `{"direction": "up"}` |
| **Volume Down** | `/api/pc/volume` | `POST` | `{"direction": "down"}` |
| **Media Play/Pause** | `/api/pc/media` | `POST` | `{"action": "play_pause"}` |
| **Media Next Track** | `/api/pc/media` | `POST` | `{"action": "next"}` |
| **Media Prev Track** | `/api/pc/media` | `POST` | `{"action": "prev"}` |
| **Display Sleep** | `/api/pc/screen` | `POST` | `{"action": "off"}` |
| **Hardware Telemetry** | `/api/pc/status` | `GET` | — |
| **Infrastructure Ping** | `/api/pc/monitors` | `GET` | — |

### Example: Remote Lock Workstation
```bash
curl -X POST https://mikasa.mrswapnil.me/api/pc/lock \
  -H "Authorization: Bearer <TOKEN>"
```

### Example: Live Workstation Telemetry Response
```json
{
  "status": "online",
  "hostname": "Swapnil-PC",
  "platform": "win32",
  "cpu": {
    "model": "AMD Ryzen 5 5600G with Radeon Graphics",
    "cores": 12,
    "loadPct": 18
  },
  "memory": {
    "totalGb": "15.4",
    "usedGb": "10.5",
    "freeGb": "4.9",
    "usagePct": "68.4"
  },
  "disks": [
    { "drive": "C:", "freeGb": "26.9", "totalGb": "201.8" },
    { "drive": "D:", "freeGb": "7.8", "totalGb": "30.0" }
  ],
  "activeWindow": "Visual Studio Code"
}
```

---

## 🧠 Neural Memory Graph & Vault

| Action | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **Memory Stats & Counts** | `/api/memories/stats` | `GET` | Total count and breakdown across 6 categories. |
| **Filter by Category** | `/api/memories?type=preference` | `GET` | Fetch only preference items. |
| **Live Search** | `/api/memories?search=iron` | `GET` | Query memories matching keyword. |
| **Delete / Prune Memory** | `/api/memories/:id` | `DELETE` | Commander pruning of stale facts. |

---

## 📋 Tasks & Strategic Goals

| Action | Endpoint | Method | Description |
| :--- | :--- | :--- | :--- |
| **List Active Tasks** | `/api/tasks` | `GET` | Returns tasks filtered by status. |
| **Create Task** | `/api/tasks` | `POST` | `{"title": "Fix API auth", "project": "Mikasa"}` |
| **Complete Task** | `/api/tasks/complete` | `POST` | `{"title": "Fix API auth"}` |
| **List Goals** | `/api/goals` | `GET` | Active strategic quarterly goals. |
| **List Reminders** | `/api/reminders` | `GET` | Active in-memory timers. |

---

## 📦 Ready-to-Use TypeScript API Client (`MikasaClient.ts`)

Copy and paste this into any React Native / Flutter / Web project:

```typescript
export class MikasaClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string = 'https://mikasa.mrswapnil.me') {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
      headers['x-commander-token'] = this.token;
    }

    const res = await fetch(`${this.baseUrl}${endpoint}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API Error ${res.status}: ${err}`);
    }
    return res.json() as Promise<T>;
  }

  // Auth
  async login(password: string) {
    const res = await this.request<{ success: boolean; access_token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    if (res.access_token) this.setToken(res.access_token);
    return res;
  }

  // Chat
  async sendMessage(message: string, conversationId: string = 'mobile-default') {
    return this.request<{ reply: string; engine: string; tools_used: any[] }>('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });
  }

  // Workstation Controls
  async lockPc() {
    return this.request<{ success: boolean; message: string }>('/api/pc/lock', { method: 'POST' });
  }

  async setVolume(direction: 'up' | 'down' | 'mute') {
    return this.request<{ success: boolean; message: string }>('/api/pc/volume', {
      method: 'POST',
      body: JSON.stringify({ direction }),
    });
  }

  async sendMediaKey(action: 'play_pause' | 'next' | 'prev') {
    return this.request<{ success: boolean; message: string }>('/api/pc/media', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  async turnOffScreen() {
    return this.request<{ success: boolean; message: string }>('/api/pc/screen', {
      method: 'POST',
      body: JSON.stringify({ action: 'off' }),
    });
  }

  // Telemetry & Monitors
  async getPcTelemetry() {
    return this.request<any>('/api/pc/status');
  }

  async getServiceMonitors() {
    return this.request<any[]>('/api/pc/monitors');
  }

  // Memory Vault
  async getMemoryStats() {
    return this.request<{ total: number; byType: Record<string, number> }>('/api/memories/stats');
  }

  async getMemories(type?: string, search?: string) {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (search) params.set('search', search);
    return this.request<any[]>(`/api/memories?${params.toString()}`);
  }
}
```
