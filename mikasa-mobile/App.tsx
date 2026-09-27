import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  RefreshControl
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

// Cloud Backend Host — Works globally over 4G/5G mobile data and Wi-Fi
const API_BASE = 'https://mikasa.mrswapnil.me';
const COMMANDER_TOKEN = 'MikasaCommander360!';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolUsed?: string;
  time: string;
}

interface PcTelemetry {
  status: string;
  hostname: string;
  cpu?: { model: string; cores: number; loadPct: number };
  memory?: { totalGb: string; usedGb: string; freeGb: string; usagePct: string };
  disks?: Array<{ drive: string; freeGb: string; totalGb: string }>;
  activeWindow?: string;
  uptimeFormatted?: string;
}

interface MemoryItem {
  id: string;
  content: string;
  memory_type: string;
  created_at?: string;
}

interface TaskItem {
  id: string;
  title: string;
  status: string;
  priority?: number;
  project_name?: string;
}

interface MonitorItem {
  name: string;
  url: string;
  status: string;
  latencyMs: number;
  ssl?: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'pc' | 'memories' | 'tasks' | 'monitors'>('chat');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      text: "I am right here with you, Swapnil. 🧣\n\nYour native mobile cockpit is connected and ready. We can manage your PC, search memories, or conquer engineering tasks.",
      time: 'Just now'
    }
  ]);
  const [inputVal, setInputVal] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Live Data States
  const [telemetry, setTelemetry] = useState<PcTelemetry | null>(null);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryFilter, setMemoryFilter] = useState<string | null>(null);
  const [memorySearch, setMemorySearch] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [serverOnline, setServerOnline] = useState<boolean>(true);

  const scrollViewRef = useRef<ScrollView>(null);

  // Helper for authorized API calls
  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${COMMANDER_TOKEN}`,
      'x-commander-token': COMMANDER_TOKEN,
      'x-commander-passkey': COMMANDER_TOKEN,
      ...(options.headers || {})
    };
    const res = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API Error ${res.status}: ${err}`);
    }
    return res.json();
  };

  // Initial Fetch & Tab Switch Fetch
  useEffect(() => {
    fetchPcStatus();
    const interval = setInterval(fetchPcStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'pc') fetchPcStatus();
    if (activeTab === 'memories') fetchMemories();
    if (activeTab === 'tasks') fetchTasks();
    if (activeTab === 'monitors') fetchMonitors();
  }, [activeTab]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (activeTab === 'pc') await fetchPcStatus();
      if (activeTab === 'memories') await fetchMemories();
      if (activeTab === 'tasks') await fetchTasks();
      if (activeTab === 'monitors') await fetchMonitors();
    } finally {
      setRefreshing(false);
    }
  };

  // 1. Fetch PC Status
  const fetchPcStatus = async () => {
    try {
      const data = await apiCall('/api/pc/status');
      setTelemetry(data);
      setServerOnline(true);
    } catch (e) {
      setServerOnline(false);
    }
  };

  // 2. Fetch Memories
  const fetchMemories = async () => {
    try {
      let url = '/api/memories?limit=50';
      if (memoryFilter) url += `&type=${encodeURIComponent(memoryFilter)}`;
      if (memorySearch) url += `&search=${encodeURIComponent(memorySearch)}`;
      const data = await apiCall(url);
      if (Array.isArray(data)) setMemories(data);
    } catch (e) {}
  };

  // 3. Fetch Tasks
  const fetchTasks = async () => {
    try {
      const data = await apiCall('/api/tasks');
      if (Array.isArray(data)) setTasks(data.filter(t => t.status !== 'completed'));
    } catch (e) {}
  };

  // 4. Fetch Monitors
  const fetchMonitors = async () => {
    try {
      const data = await apiCall('/api/pc/monitors');
      if (Array.isArray(data)) setMonitors(data);
    } catch (e) {}
  };

  // Chat Submission
  const handleSend = async (customPrompt?: string) => {
    const textToSend = (customPrompt || inputVal).trim();
    if (!textToSend || isSending) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    if (!customPrompt) setInputVal('');
    setIsSending(true);

    try {
      const res = await apiCall('/api/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: textToSend,
          conversation_id: 'mikasa-mobile-app'
        })
      });

      const toolUsed = res.tools_used && res.tools_used.length > 0 ? res.tools_used[0].tool : undefined;
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: res.reply || 'Acknowledged, Commander.',
        toolUsed,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages(prev => [...prev, assistantMsg]);
      try {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {}
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: `⚠️ Network error: ${err.message}`,
          time: 'Error'
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Remote PC Hardware Actions
  const handleRemoteAction = async (action: 'lock' | 'mute' | 'volup' | 'voldown' | 'media' | 'screen') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}

    try {
      let res;
      if (action === 'lock') {
        res = await apiCall('/api/pc/lock', { method: 'POST' });
      } else if (action === 'mute' || action === 'volup' || action === 'voldown') {
        const dir = action === 'volup' ? 'up' : action === 'voldown' ? 'down' : 'mute';
        res = await apiCall('/api/pc/volume', { method: 'POST', body: JSON.stringify({ direction: dir }) });
      } else if (action === 'media') {
        res = await apiCall('/api/pc/media', { method: 'POST', body: JSON.stringify({ action: 'play_pause' }) });
      } else if (action === 'screen') {
        res = await apiCall('/api/pc/screen', { method: 'POST', body: JSON.stringify({ action: 'off' }) });
      }
      Alert.alert('Hardware Action', res.message || 'Action executed successfully.');
    } catch (err: any) {
      Alert.alert('Action Failed', err.message);
    }
  };

  // Complete Task
  const handleCompleteTask = async (title: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
    try {
      await apiCall('/api/tasks/complete', {
        method: 'POST',
        body: JSON.stringify({ title })
      });
      setTasks(prev => prev.filter(t => t.title !== title));
    } catch (err: any) {
      Alert.alert('Task Error', err.message);
    }
  };

  return (
    <SafeAreaView style={styles.safeContainer}>
      <StatusBar style="light" />

      {/* TOP HEADER */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.avatarBorder}>
            <Image
              source={{ uri: `${API_BASE}/Mikasa-logo.jpeg` }}
              style={styles.avatarImg}
            />
            <View style={[styles.avatarPulse, { backgroundColor: serverOnline ? '#10b981' : '#f59e0b' }]} />
          </View>
          <View>
            <View style={styles.titleWithBadge}>
              <Text style={styles.brandTitle}>MIKASA</Text>
              <View style={styles.osBadge}>
                <Text style={styles.osBadgeText}>MOBILE OS</Text>
              </View>
            </View>
            <Text style={styles.brandSubtitle}>Swapnil's Executive Companion</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={styles.serverPill}>
            <Text style={styles.serverPillDot}>●</Text>
            <Text style={styles.serverPillText}>{serverOnline ? 'ONLINE' : 'CLOUD'}</Text>
          </View>
          <TouchableOpacity
            style={styles.quickLockBtn}
            onPress={() => handleRemoteAction('lock')}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 16 }}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* VIEWPORT BASED ON ACTIVE TAB */}
      <View style={styles.viewport}>
        {/* TAB 1: CHAT */}
        {activeTab === 'chat' && (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.chatContainer}
          >
            <ScrollView
              ref={scrollViewRef}
              style={styles.messagesScroll}
              contentContainerStyle={{ paddingVertical: 14 }}
              onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.map(msg => (
                <View
                  key={msg.id}
                  style={[
                    styles.msgRow,
                    msg.role === 'user' ? styles.msgRowUser : styles.msgRowAssistant
                  ]}
                >
                  {msg.role === 'assistant' && (
                    <Image
                      source={{ uri: `${API_BASE}/Mikasa-logo.jpeg` }}
                      style={styles.msgAvatar}
                    />
                  )}
                  <View
                    style={[
                      styles.bubble,
                      msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant
                    ]}
                  >
                    {msg.toolUsed && (
                      <View style={styles.toolTag}>
                        <Text style={styles.toolTagText}>⚡ {msg.toolUsed}</Text>
                      </View>
                    )}
                    <Text
                      style={[
                        styles.bubbleText,
                        msg.role === 'user' ? styles.bubbleTextUser : styles.bubbleTextAssistant
                      ]}
                    >
                      {msg.text}
                    </Text>
                    <Text style={styles.msgTime}>{msg.time}</Text>
                  </View>
                </View>
              ))}
              {isSending && (
                <View style={[styles.msgRow, styles.msgRowAssistant]}>
                  <Image
                    source={{ uri: `${API_BASE}/Mikasa-logo.jpeg` }}
                    style={styles.msgAvatar}
                  />
                  <View style={[styles.bubble, styles.bubbleAssistant, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <ActivityIndicator size="small" color="#38bdf8" />
                    <Text style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: 13 }}>Mikasa is thinking...</Text>
                  </View>
                </View>
              )}
            </ScrollView>

            {/* Quick Suggestion Chips */}
            <View style={styles.suggestionsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsScroll}>
                <TouchableOpacity
                  style={styles.sugChip}
                  onPress={() => handleSend('Give me a full morning sitrep briefing')}
                >
                  <Text style={styles.sugChipText}>📋 Morning Sitrep</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sugChip}
                  onPress={() => handleSend('Check PC hardware status')}
                >
                  <Text style={styles.sugChipText}>🖥️ PC Telemetry</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sugChip}
                  onPress={() => handleSend('amr pc theke CV pathao')}
                >
                  <Text style={styles.sugChipText}>📄 Send CV from PC</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sugChip}
                  onPress={() => handleSend('Check latest commit of stark-os-portfolio')}
                >
                  <Text style={styles.sugChipText}>🐙 GitHub Commits</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* Chat Input Bar */}
            <View style={styles.inputBar}>
              <TextInput
                style={styles.textInput}
                placeholder="Message Mikasa..."
                placeholderTextColor="#64748b"
                value={inputVal}
                onChangeText={setInputVal}
                onSubmitEditing={() => handleSend()}
                returnKeyType="send"
              />
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={() => handleSend()}
                disabled={isSending || !inputVal.trim()}
              >
                <Text style={styles.sendBtnIcon}>➤</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}

        {/* TAB 2: PC COCKPIT */}
        {activeTab === 'pc' && (
          <ScrollView
            style={styles.scrollPage}
            contentContainerStyle={styles.scrollPageContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
          >
            <Text style={styles.pageTitle}>Workstation Cockpit</Text>
            <Text style={styles.pageSubtitle}>Swapnil-PC Hardware Bridge & Remote Controls</Text>

            {/* Gauge Cards Grid */}
            <View style={styles.grid2x2}>
              <View style={styles.gaugeCard}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.gaugeLabel}>CPU LOAD</Text>
                  <Text style={{ color: '#38bdf8', fontSize: 13 }}>⚡</Text>
                </View>
                <Text style={styles.gaugeValue}>{telemetry?.cpu?.loadPct ?? '--'}%</Text>
                <Text style={styles.gaugeSubtext}>{telemetry?.cpu?.model ? telemetry.cpu.model.slice(0, 20) : 'Ryzen 5 5600G'}</Text>
              </View>

              <View style={styles.gaugeCard}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.gaugeLabel}>RAM USAGE</Text>
                  <Text style={{ color: '#10b981', fontSize: 13 }}>💾</Text>
                </View>
                <Text style={styles.gaugeValue}>{telemetry?.memory?.usagePct ?? '--'}%</Text>
                <Text style={styles.gaugeSubtext}>{telemetry?.memory?.usedGb ?? '--'} / 15.4 GB</Text>
              </View>

              <View style={[styles.gaugeCard, { width: '100%' }]}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.gaugeLabel}>ACTIVE WORKSPACE</Text>
                  <Text style={{ color: '#38bdf8', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                    {telemetry?.uptimeFormatted ? `Up: ${telemetry.uptimeFormatted}` : 'Live'}
                  </Text>
                </View>
                <Text style={[styles.gaugeValue, { fontSize: 16, marginTop: 4 }]}>
                  {telemetry?.activeWindow || 'Windows Desktop'}
                </Text>
                <Text style={styles.gaugeSubtext}>
                  {telemetry?.disks ? telemetry.disks.map(d => `${d.drive} ${d.freeGb}GB free`).join('  |  ') : 'Drive C: 26.6GB free'}
                </Text>
              </View>
            </View>

            {/* Remote Workstation Controls */}
            <Text style={styles.sectionHeading}>REMOTE WORKSTATION CONTROLS</Text>
            <View style={styles.actionsList}>
              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => handleRemoteAction('lock')}
                activeOpacity={0.7}
              >
                <View style={styles.tileLeft}>
                  <View style={[styles.tileIconWrap, { borderColor: 'rgba(239, 68, 68, 0.4)' }]}>
                    <Text style={{ fontSize: 18 }}>🔒</Text>
                  </View>
                  <View>
                    <Text style={styles.tileTitle}>Lock Workstation</Text>
                    <Text style={styles.tileDesc}>Immediate desktop lockdown (Win + L)</Text>
                  </View>
                </View>
                <Text style={styles.tileArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => handleRemoteAction('mute')}
                activeOpacity={0.7}
              >
                <View style={styles.tileLeft}>
                  <View style={[styles.tileIconWrap, { borderColor: 'rgba(245, 158, 11, 0.4)' }]}>
                    <Text style={{ fontSize: 18 }}>🔇</Text>
                  </View>
                  <View>
                    <Text style={styles.tileTitle}>Toggle Master Mute</Text>
                    <Text style={styles.tileDesc}>Mute or unmute PC system audio</Text>
                  </View>
                </View>
                <Text style={styles.tileArrow}>›</Text>
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.actionTile, { flex: 1 }]}
                  onPress={() => handleRemoteAction('volup')}
                  activeOpacity={0.7}
                >
                  <View style={styles.tileLeft}>
                    <Text style={{ fontSize: 18 }}>🔊</Text>
                    <Text style={styles.tileTitle}>Vol Up</Text>
                  </View>
                  <Text style={styles.tileArrow}>+</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionTile, { flex: 1 }]}
                  onPress={() => handleRemoteAction('voldown')}
                  activeOpacity={0.7}
                >
                  <View style={styles.tileLeft}>
                    <Text style={{ fontSize: 18 }}>🔉</Text>
                    <Text style={styles.tileTitle}>Vol Down</Text>
                  </View>
                  <Text style={styles.tileArrow}>-</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => handleRemoteAction('media')}
                activeOpacity={0.7}
              >
                <View style={styles.tileLeft}>
                  <View style={[styles.tileIconWrap, { borderColor: 'rgba(168, 85, 247, 0.4)' }]}>
                    <Text style={{ fontSize: 18 }}>⏯️</Text>
                  </View>
                  <View>
                    <Text style={styles.tileTitle}>Media Play / Pause</Text>
                    <Text style={styles.tileDesc}>Toggle Spotify / YouTube music playback</Text>
                  </View>
                </View>
                <Text style={styles.tileArrow}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionTile}
                onPress={() => handleRemoteAction('screen')}
                activeOpacity={0.7}
              >
                <View style={styles.tileLeft}>
                  <View style={[styles.tileIconWrap, { borderColor: 'rgba(100, 116, 139, 0.4)' }]}>
                    <Text style={{ fontSize: 18 }}>💤</Text>
                  </View>
                  <View>
                    <Text style={styles.tileTitle}>Sleep Monitors</Text>
                    <Text style={styles.tileDesc}>Power down workstation screens</Text>
                  </View>
                </View>
                <Text style={styles.tileArrow}>›</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* TAB 3: MEMORIES */}
        {activeTab === 'memories' && (
          <View style={styles.pageContainer}>
            <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
              <Text style={styles.pageTitle}>Neural Memory Vault</Text>
              <Text style={styles.pageSubtitle}>123+ memories continuously retained</Text>

              {/* Search input */}
              <TextInput
                style={styles.searchBar}
                placeholder="Search facts, preferences, decisions..."
                placeholderTextColor="#64748b"
                value={memorySearch}
                onChangeText={t => {
                  setMemorySearch(t);
                  fetchMemories();
                }}
              />

              {/* Filter Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {['All', 'preference', 'fact', 'workflow', 'decision', 'instruction'].map(f => {
                  const isAll = f === 'All';
                  const active = isAll ? memoryFilter === null : memoryFilter === f;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[styles.filterPill, active && styles.filterPillActive]}
                      onPress={() => {
                        setMemoryFilter(isAll ? null : f);
                        fetchMemories();
                      }}
                    >
                      <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView
              style={{ flex: 1, paddingHorizontal: 16, marginTop: 8 }}
              contentContainerStyle={{ paddingBottom: 20 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
            >
              {memories.map(m => (
                <View key={m.id} style={styles.memoryCard}>
                  <View style={styles.memoryHeader}>
                    <View style={styles.memTag}>
                      <Text style={styles.memTagText}>{m.memory_type}</Text>
                    </View>
                    <Text style={styles.memDate}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</Text>
                  </View>
                  <Text style={styles.memoryContent}>{m.content}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* TAB 4: TASKS */}
        {activeTab === 'tasks' && (
          <ScrollView
            style={styles.scrollPage}
            contentContainerStyle={styles.scrollPageContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
          >
            <Text style={styles.pageTitle}>Operational Tasks</Text>
            <Text style={styles.pageSubtitle}>Active engineering sprints & todos</Text>

            <View style={styles.tasksList}>
              {tasks.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={{ color: '#94a3b8', fontSize: 14 }}>All tasks clear right now! ✨</Text>
                </View>
              ) : (
                tasks.map(t => (
                  <View key={t.id} style={styles.taskCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskTitle}>{t.title}</Text>
                      <Text style={styles.taskMeta}>
                        {t.project_name || 'General'} • Priority {t.priority || 7}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.taskCheckBtn}
                      onPress={() => handleCompleteTask(t.title)}
                    >
                      <Text style={{ color: '#38bdf8', fontSize: 16, fontWeight: '700' }}>✓</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}

        {/* TAB 5: MONITORS */}
        {activeTab === 'monitors' && (
          <ScrollView
            style={styles.scrollPage}
            contentContainerStyle={styles.scrollPageContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
          >
            <Text style={styles.pageTitle}>Service Monitors</Text>
            <Text style={styles.pageSubtitle}>Live uptime & latency beacons</Text>

            <View style={styles.monitorsList}>
              {monitors.map((m, idx) => {
                const isUp = m.status === 'UP';
                return (
                  <View key={idx} style={styles.monitorCard}>
                    <View style={styles.cardTopRow}>
                      <Text style={styles.monName}>{m.name}</Text>
                      <View style={[styles.monBadge, { backgroundColor: isUp ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)' }]}>
                        <Text style={{ color: isUp ? '#34d399' : '#f87171', fontSize: 11, fontWeight: '700' }}>
                          {isUp ? '● UP' : '▲ ISSUE'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.monUrl}>{m.url}</Text>
                    <View style={styles.monFoot}>
                      <Text style={styles.monFootText}>Latency: <Text style={{ color: '#38bdf8', fontWeight: '700' }}>{m.latencyMs}ms</Text></Text>
                      <Text style={styles.monFootText}>SSL: <Text style={{ color: '#10b981' }}>{m.ssl || 'VALID'}</Text></Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>

      {/* BOTTOM NAVIGATION DOCK */}
      <View style={styles.bottomNav}>
        {[
          { key: 'chat', label: 'Chat', icon: '💬' },
          { key: 'pc', label: 'Cockpit', icon: '🖥️' },
          { key: 'memories', label: 'Memory', icon: '🧠' },
          { key: 'tasks', label: 'Tasks', icon: '📋' },
          { key: 'monitors', label: 'Monitors', icon: '🌐' }
        ].map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.navBtn}
              onPress={() => {
                try {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                } catch (e) {}
                setActiveTab(tab.key as any);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.navIcon, isActive && styles.navIconActive]}>{tab.icon}</Text>
              <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#070b14',
    paddingTop: Platform.OS === 'android' ? 30 : 0
  },
  header: {
    height: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(7, 11, 20, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)'
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  avatarBorder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(56, 189, 248, 0.5)',
    position: 'relative'
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 20
  },
  avatarPulse: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#070b14'
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  brandTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  osBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1
  },
  osBadgeText: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '700'
  },
  brandSubtitle: {
    color: '#94a3b8',
    fontSize: 11
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  serverPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4
  },
  serverPillDot: {
    color: '#10b981',
    fontSize: 8
  },
  serverPillText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700'
  },
  quickLockBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  viewport: {
    flex: 1
  },
  chatContainer: {
    flex: 1
  },
  messagesScroll: {
    flex: 1,
    paddingHorizontal: 14
  },
  msgRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    maxWidth: '85%'
  },
  msgRowUser: {
    alignSelf: 'flex-end',
    flexDirection: 'row-reverse'
  },
  msgRowAssistant: {
    alignSelf: 'flex-start'
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    marginTop: 2
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18
  },
  bubbleUser: {
    backgroundColor: '#0284c7',
    borderBottomRightRadius: 4
  },
  bubbleAssistant: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 4
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20
  },
  bubbleTextUser: {
    color: '#ffffff'
  },
  bubbleTextAssistant: {
    color: '#f8fafc'
  },
  toolTag: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 6
  },
  toolTagText: {
    color: '#38bdf8',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700'
  },
  msgTime: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 9,
    alignSelf: 'flex-end',
    marginTop: 4
  },
  suggestionsContainer: {
    height: 40,
    marginBottom: 6
  },
  suggestionsScroll: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center'
  },
  sugChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  sugChipText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500'
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#070b14',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    gap: 8
  },
  textInput: {
    flex: 1,
    height: 42,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 21,
    paddingHorizontal: 16,
    color: '#f8fafc',
    fontSize: 14
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sendBtnIcon: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  scrollPage: {
    flex: 1
  },
  scrollPageContent: {
    padding: 16,
    paddingBottom: 24
  },
  pageContainer: {
    flex: 1
  },
  pageTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800'
  },
  pageSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 14
  },
  grid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16
  },
  gaugeCard: {
    width: (width - 42) / 2,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 14
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  gaugeLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  gaugeValue: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  gaugeSubtext: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4
  },
  sectionHeading: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 6
  },
  actionsList: {
    gap: 8
  },
  actionTile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 14
  },
  tileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  tileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tileTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700'
  },
  tileDesc: {
    color: '#64748b',
    fontSize: 11
  },
  tileArrow: {
    color: '#64748b',
    fontSize: 18
  },
  searchBar: {
    height: 40,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    color: '#f8fafc',
    fontSize: 13,
    marginBottom: 10
  },
  filterRow: {
    gap: 6,
    paddingBottom: 4
  },
  filterPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5
  },
  filterPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: '#38bdf8'
  },
  filterPillText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600'
  },
  filterPillTextActive: {
    color: '#38bdf8'
  },
  memoryCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6
  },
  memTag: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6
  },
  memTagText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  memDate: {
    color: '#64748b',
    fontSize: 10
  },
  memoryContent: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18
  },
  tasksList: {
    gap: 8
  },
  emptyCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center'
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 14
  },
  taskTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600'
  },
  taskMeta: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 3
  },
  taskCheckBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  monitorsList: {
    gap: 8
  },
  monitorCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    padding: 14
  },
  monName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700'
  },
  monBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10
  },
  monUrl: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2
  },
  monFoot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)'
  },
  monFootText: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace'
  },
  bottomNav: {
    height: 64,
    flexDirection: 'row',
    backgroundColor: '#070b14',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'space-around'
  },
  navBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12
  },
  navIcon: {
    fontSize: 18,
    opacity: 0.6
  },
  navIconActive: {
    opacity: 1
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2
  },
  navLabelActive: {
    color: '#38bdf8',
    fontWeight: '700'
  }
});
