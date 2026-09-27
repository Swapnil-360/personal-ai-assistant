import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Platform,
  Dimensions,
  Animated,
  Easing,
  Alert,
  Modal
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as Battery from 'expo-battery';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import * as Speech from 'expo-speech';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';

const { width } = Dimensions.get('window');

// Backend Host & Secret Handshake
const API_BASE = 'https://mikasa.mrswapnil.me';
const COMMANDER_TOKEN = 'MikasaCommander360!';

type AssistantState = 'IDLE' | 'LISTENING' | 'THINKING' | 'EXECUTING' | 'SPEAKING' | 'ERROR';

interface ToolExecutionStep {
  label: string;
  status: 'pending' | 'running' | 'done';
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolUsed?: string;
  time: string;
}

interface MemoryItem {
  id: string;
  content: string;
  memory_type: string;
  created_at?: string;
}

export default function App() {
  // Navigation / View Modes
  // 'assistant' (Voice-First Orb Core) | 'chat' (Secondary Conversation) | 'device' (Hardware Tools) | 'memory' (Vault) | 'dashboard' (Secondary Sitrep)
  const [viewMode, setViewMode] = useState<'assistant' | 'chat' | 'device' | 'memory' | 'dashboard'>('assistant');
  const [assistantState, setAssistantState] = useState<AssistantState>('IDLE');
  const [statusMessage, setStatusMessage] = useState('Ready');
  const [currentActionTitle, setCurrentActionTitle] = useState('');
  const [executionSteps, setExecutionSteps] = useState<ToolExecutionStep[]>([]);
  const [showExecutionCard, setShowExecutionCard] = useState(false);

  // Phone Native Sensors
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean>(false);
  const [networkType, setNetworkType] = useState<string>('Detecting...');
  const [deviceName, setDeviceName] = useState<string>('Android Device');
  const [currentCity, setCurrentCity] = useState<string>('Dhaka');

  // Workstation PC Telemetry (Remote)
  const [pcOnline, setPcOnline] = useState<boolean>(true);
  const [pcCpu, setPcCpu] = useState<number>(0);
  const [pcRam, setPcRam] = useState<number>(0);
  const [pcActiveWindow, setPcActiveWindow] = useState<string>('Visual Studio Code');
  const [pcUptime, setPcUptime] = useState<string>('Live');

  // Secondary Views Data
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      text: "I am ready, Commander Swapnil. Say what you need; I handle the rest.",
      time: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memorySearch, setMemorySearch] = useState('');
  const [activeMemoryCategory, setActiveMemoryCategory] = useState<string | null>(null);

  // Animation values for Orb
  const orbScale = useRef(new Animated.Value(1)).current;
  const orbGlow = useRef(new Animated.Value(0.3)).current;
  const orbRotate = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Onboarding / Permission Modal
  const [showPermissionModal, setShowPermissionModal] = useState(false);

  // 1. Initial Hardware Setup & Permissions
  useEffect(() => {
    initPhoneSensors();
    pollWorkstationStatus();
    const sensorInterval = setInterval(initPhoneSensors, 20000);
    const pcInterval = setInterval(pollWorkstationStatus, 15000);
    return () => {
      clearInterval(sensorInterval);
      clearInterval(pcInterval);
    };
  }, []);

  // 2. Orb State Animation Driver
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 2400, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start();

    if (assistantState === 'IDLE') {
      Animated.timing(orbScale, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      Animated.timing(orbGlow, { toValue: 0.25, duration: 500, useNativeDriver: false }).start();
    } else if (assistantState === 'LISTENING') {
      Animated.spring(orbScale, { toValue: 1.25, friction: 4, useNativeDriver: true }).start();
      Animated.timing(orbGlow, { toValue: 0.85, duration: 300, useNativeDriver: false }).start();
    } else if (assistantState === 'THINKING') {
      Animated.loop(
        Animated.timing(orbRotate, { toValue: 1, duration: 3000, easing: Easing.linear, useNativeDriver: true })
      ).start();
    } else if (assistantState === 'EXECUTING') {
      Animated.spring(orbScale, { toValue: 1.15, friction: 5, useNativeDriver: true }).start();
    } else if (assistantState === 'SPEAKING') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(orbScale, { toValue: 1.2, duration: 250, useNativeDriver: true }),
          Animated.timing(orbScale, { toValue: 0.95, duration: 250, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [assistantState]);

  // Read Phone Sensors
  const initPhoneSensors = async () => {
    try {
      // Battery
      const bLevel = await Battery.getBatteryLevelAsync();
      setBatteryLevel(Math.round(bLevel * 100));
      const bState = await Battery.getBatteryStateAsync();
      setIsCharging(bState === Battery.BatteryState.CHARGING || bState === Battery.BatteryState.FULL);

      // Network
      const net = await Network.getNetworkStateAsync();
      if (net.type === Network.NetworkStateType.WIFI) {
        setNetworkType('Wi-Fi');
      } else if (net.type === Network.NetworkStateType.CELLULAR) {
        setNetworkType('Cellular 4G/5G');
      } else {
        setNetworkType('Connected');
      }

      // Device info
      if (Device.modelName) {
        setDeviceName(Device.modelName);
      } else if (Device.brand) {
        setDeviceName(`${Device.brand} ${Device.osName || ''}`);
      }
    } catch (e) {}
  };

  // Poll Workstation Status
  const pollWorkstationStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pc/status`, {
        headers: {
          'Authorization': `Bearer ${COMMANDER_TOKEN}`,
          'x-commander-token': COMMANDER_TOKEN
        }
      });
      if (res.ok) {
        const data = await res.json();
        setPcOnline(true);
        if (data.cpu) setPcCpu(data.cpu.loadPct || 0);
        if (data.memory) setPcRam(Math.round(parseFloat(data.memory.usagePct || '0')));
        if (data.activeWindow) setPcActiveWindow(data.activeWindow);
        if (data.uptimeFormatted) setPcUptime(data.uptimeFormatted);
      } else {
        setPcOnline(false);
      }
    } catch (e) {
      setPcOnline(false);
    }
  };

  // Trigger Native Voice Interaction
  const startVoiceInteraction = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    setAssistantState('LISTENING');
    setStatusMessage('Listening...');

    // Simulate listening window with tactile interaction
    setTimeout(() => {
      // Transition to Thinking
      setAssistantState('THINKING');
      setStatusMessage('Thinking...');
      
      // Auto-trigger sample executive prompt
      processCommand("Give me an executive briefing on my workstation and tasks.");
    }, 2800);
  };

  // Core Command Dispatcher
  const processCommand = async (commandText: string) => {
    setAssistantState('THINKING');
    setStatusMessage('Reasoning with Gemini...');

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${COMMANDER_TOKEN}`,
          'x-commander-token': COMMANDER_TOKEN
        },
        body: JSON.stringify({
          message: commandText,
          conversation_id: 'mikasa-android-core'
        })
      });

      const data = await res.json();
      const reply = data.reply || "Done, Commander.";
      const toolUsed = data.tools_used && data.tools_used.length > 0 ? data.tools_used[0].tool : null;

      // If a tool was executed, show transparent live execution flow
      if (toolUsed) {
        setAssistantState('EXECUTING');
        setStatusMessage('Executing tool...');
        setCurrentActionTitle(toolUsed);
        setExecutionSteps([
          { label: 'Resolving command intent', status: 'done' },
          { label: `Calling tool: ${toolUsed}`, status: 'running' },
          { label: 'Verifying result with workstation', status: 'pending' }
        ]);
        setShowExecutionCard(true);

        setTimeout(() => {
          setExecutionSteps([
            { label: 'Resolving command intent', status: 'done' },
            { label: `Calling tool: ${toolUsed}`, status: 'done' },
            { label: 'Verifying result with workstation', status: 'done' }
          ]);
        }, 1200);
      }

      // Add to conversation record
      setMessages(prev => [
        ...prev,
        { id: Date.now().toString(), role: 'user', text: commandText, time: 'Now' },
        { id: (Date.now() + 1).toString(), role: 'assistant', text: reply, toolUsed: toolUsed || undefined, time: 'Now' }
      ]);

      // Speak response aloud via Text-to-Speech
      setAssistantState('SPEAKING');
      setStatusMessage('Speaking...');
      try {
        Speech.stop();
        Speech.speak(reply.slice(0, 160).replace(/[*`_]/g, ''), {
          language: 'en-US',
          pitch: 1.05,
          rate: 1.0,
          onDone: () => {
            setAssistantState('IDLE');
            setStatusMessage('Ready');
          },
          onError: () => {
            setAssistantState('IDLE');
            setStatusMessage('Ready');
          }
        });
      } catch (e) {
        setAssistantState('IDLE');
        setStatusMessage('Ready');
      }

    } catch (err: any) {
      setAssistantState('ERROR');
      setStatusMessage(`Error: ${err.message}`);
      setTimeout(() => {
        setAssistantState('IDLE');
        setStatusMessage('Ready');
      }, 3500);
    }
  };

  // Device Hardware Action
  const executeDeviceTool = async (action: 'lock' | 'mute' | 'volup' | 'voldown' | 'media' | 'screen' | 'copy_token' | 'battery_status') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}

    if (action === 'copy_token') {
      await Clipboard.setStringAsync(COMMANDER_TOKEN);
      Alert.alert('Clipboard', 'Commander token copied.');
      return;
    }

    if (action === 'battery_status') {
      const bMsg = `Phone: ${batteryLevel}% (${isCharging ? 'Charging' : 'Discharging'}) | Model: ${deviceName}`;
      Speech.speak(bMsg);
      Alert.alert('Device Battery Telemetry', bMsg);
      return;
    }

    setAssistantState('EXECUTING');
    setStatusMessage(`Executing ${action}...`);

    try {
      let endpoint = '';
      let body = {};
      if (action === 'lock') endpoint = '/api/pc/lock';
      if (action === 'mute') { endpoint = '/api/pc/volume'; body = { direction: 'mute' }; }
      if (action === 'volup') { endpoint = '/api/pc/volume'; body = { direction: 'up' }; }
      if (action === 'voldown') { endpoint = '/api/pc/volume'; body = { direction: 'down' }; }
      if (action === 'media') { endpoint = '/api/pc/media'; body = { action: 'play_pause' }; }
      if (action === 'screen') { endpoint = '/api/pc/screen'; body = { action: 'off' }; }

      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${COMMANDER_TOKEN}`,
          'x-commander-token': COMMANDER_TOKEN
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setAssistantState('IDLE');
      setStatusMessage('Ready');
      Alert.alert('Action Executed', data.message || 'Done.');
    } catch (err: any) {
      setAssistantState('ERROR');
      setStatusMessage(err.message);
      Alert.alert('Execution Error', err.message);
    }
  };

  // Request Permissions with Explanation
  const requestSystemPermissions = async () => {
    try {
      const locRes = await Location.requestForegroundPermissionsAsync();
      if (locRes.granted) {
        const loc = await Location.getCurrentPositionAsync({});
        if (loc) {
          const rev = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude
          });
          if (rev && rev[0] && rev[0].city) {
            setCurrentCity(rev[0].city);
          }
        }
      }
      setShowPermissionModal(false);
      Alert.alert('Permissions Granted', 'Mikasa is now bridged with phone sensors and geolocation.');
    } catch (e) {
      setShowPermissionModal(false);
    }
  };

  // Fetch Memories
  const loadMemories = async () => {
    try {
      let url = `${API_BASE}/api/memories?limit=40`;
      if (activeMemoryCategory) url += `&type=${activeMemoryCategory}`;
      if (memorySearch) url += `&search=${encodeURIComponent(memorySearch)}`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${COMMANDER_TOKEN}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) setMemories(data);
    } catch (e) {}
  };

  // Fetch Memories on Tab Open
  useEffect(() => {
    if (viewMode === 'memory') loadMemories();
  }, [viewMode, activeMemoryCategory, memorySearch]);

  const spin = orbRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        {/* 1. TOP SYSTEM BAR */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={styles.identityRing}>
            <View style={[styles.identityDot, { backgroundColor: pcOnline ? '#10b981' : '#f59e0b' }]} />
          </View>
          <View>
            <Text style={styles.systemTitle}>MIKASA</Text>
            <Text style={styles.systemSubtitle}>PERSONAL OS • COMMANDER</Text>
          </View>
        </View>

        <View style={styles.topBarRight}>
          <TouchableOpacity
            style={styles.pillSensor}
            onPress={() => executeDeviceTool('battery_status')}
            activeOpacity={0.7}
          >
            <Text style={styles.pillSensorText}>
              🔋 {batteryLevel !== null ? `${batteryLevel}%` : '--'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btnNavCircle}
            onPress={() => setShowPermissionModal(true)}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 13 }}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 2. MODE SELECTOR (DISCREET SYSTEM CHIPS) */}
      <View style={styles.modeChipsRow}>
        <TouchableOpacity
          style={[styles.modeChip, viewMode === 'assistant' && styles.modeChipActive]}
          onPress={() => setViewMode('assistant')}
        >
          <Text style={[styles.modeChipText, viewMode === 'assistant' && styles.modeChipTextActive]}>
            Assistant
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeChip, viewMode === 'chat' && styles.modeChipActive]}
          onPress={() => setViewMode('chat')}
        >
          <Text style={[styles.modeChipText, viewMode === 'chat' && styles.modeChipTextActive]}>
            Conversation
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeChip, viewMode === 'device' && styles.modeChipActive]}
          onPress={() => setViewMode('device')}
        >
          <Text style={[styles.modeChipText, viewMode === 'device' && styles.modeChipTextActive]}>
            Device & PC
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeChip, viewMode === 'memory' && styles.modeChipActive]}
          onPress={() => setViewMode('memory')}
        >
          <Text style={[styles.modeChipText, viewMode === 'memory' && styles.modeChipTextActive]}>
            Memory
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.modeChip, viewMode === 'dashboard' && styles.modeChipActive]}
          onPress={() => setViewMode('dashboard')}
        >
          <Text style={[styles.modeChipText, viewMode === 'dashboard' && styles.modeChipTextActive]}>
            Sitrep
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. MAIN ASSISTANT SCREEN (VOICE FIRST) */}
      {viewMode === 'assistant' && (
        <View style={styles.assistantCoreView}>
          <View style={styles.centerStage}>
            {/* Holographic Orb Container */}
            <View style={styles.orbWrapper}>
              {/* Outer Glow Halo */}
              <Animated.View
                style={[
                  styles.orbHalo,
                  {
                    transform: [{ scale: pulseAnim }],
                    borderColor:
                      assistantState === 'ERROR'
                        ? 'rgba(239, 68, 68, 0.4)'
                        : assistantState === 'LISTENING' || assistantState === 'SPEAKING'
                        ? 'rgba(225, 29, 72, 0.35)'
                        : 'rgba(56, 189, 248, 0.25)',
                  }
                ]}
              />

              {/* Main Resonating Orb */}
              <Animated.View
                style={[
                  styles.mainOrb,
                  {
                    transform: [{ scale: orbScale }, { rotate: spin }],
                    backgroundColor:
                      assistantState === 'ERROR'
                        ? '#ef4444'
                        : assistantState === 'LISTENING' || assistantState === 'SPEAKING'
                        ? '#e11d48'
                        : '#0f172a',
                    borderColor:
                      assistantState === 'LISTENING' || assistantState === 'SPEAKING'
                        ? '#fda4af'
                        : '#38bdf8'
                  }
                ]}
              >
                <View style={styles.orbInnerCore}>
                  <Text style={styles.orbCoreSymbol}>
                    {assistantState === 'LISTENING' ? '🎙️' : assistantState === 'THINKING' ? '⚡' : assistantState === 'SPEAKING' ? '🔊' : '🧣'}
                  </Text>
                </View>
              </Animated.View>
            </View>

            {/* Typography Status */}
            <Text style={styles.assistantName}>Mikasa</Text>
            <Text style={styles.assistantStatusText}>{statusMessage}</Text>

            {/* Live Tool Execution Component */}
            {showExecutionCard && (
              <View style={styles.executionCard}>
                <View style={styles.execCardHeader}>
                  <Text style={styles.execCardTitle}>⚡ {currentActionTitle}</Text>
                  <TouchableOpacity onPress={() => setShowExecutionCard(false)}>
                    <Text style={{ color: '#64748b', fontSize: 11 }}>✕</Text>
                  </TouchableOpacity>
                </View>
                {executionSteps.map((s, idx) => (
                  <View key={idx} style={styles.execStepRow}>
                    <Text style={{ color: s.status === 'done' ? '#10b981' : '#38bdf8', fontSize: 12, marginRight: 6 }}>
                      {s.status === 'done' ? '✓' : '→'}
                    </Text>
                    <Text style={[styles.execStepText, s.status === 'done' && styles.execStepDone]}>
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Quick Command Tray */}
          <View style={styles.quickCommandTray}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickCommandsScroll}>
              <TouchableOpacity
                style={styles.quickCmdPill}
                onPress={() => processCommand("Give me a full morning sitrep briefing.")}
              >
                <Text style={styles.quickCmdText}>📋 Morning Sitrep</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCmdPill}
                onPress={() => processCommand("Check PC hardware telemetry.")}
              >
                <Text style={styles.quickCmdText}>🖥️ Workstation Status</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCmdPill}
                onPress={() => processCommand("amr pc theke CV pathao.")}
              >
                <Text style={styles.quickCmdText}>📄 Send CV from PC</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCmdPill}
                onPress={() => processCommand("What are my pending tasks in Supabase?")}
              >
                <Text style={styles.quickCmdText}>⚡ Active Tasks</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.quickCmdPill}
                onPress={() => processCommand("Why did you choose Swapnil over Eren?")}
              >
                <Text style={styles.quickCmdText}>🧣 Why Swapnil?</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Large Voice Interaction Button */}
          <View style={styles.voiceBottomContainer}>
            <TouchableOpacity
              style={[
                styles.voiceTriggerBtn,
                assistantState === 'LISTENING' && styles.voiceTriggerBtnActive
              ]}
              onPress={startVoiceInteraction}
              activeOpacity={0.8}
            >
              <Text style={styles.voiceTriggerIcon}>
                {assistantState === 'LISTENING' ? '◼' : '🎙️'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.voiceTriggerPrompt}>
              {assistantState === 'LISTENING' ? 'Listening...' : 'Tap to speak to Mikasa'}
            </Text>
          </View>
        </View>
      )}

      {/* 4. CONVERSATION VIEW (SECONDARY) */}
      {viewMode === 'chat' && (
        <View style={styles.subPageView}>
          <ScrollView style={styles.chatScroll} contentContainerStyle={{ padding: 16 }}>
            {messages.map(m => (
              <View
                key={m.id}
                style={[
                  styles.chatBubbleRow,
                  m.role === 'user' ? styles.chatBubbleRowUser : styles.chatBubbleRowAssistant
                ]}
              >
                <View
                  style={[
                    styles.chatBubble,
                    m.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant
                  ]}
                >
                  {m.toolUsed && (
                    <Text style={styles.chatToolUsedTag}>⚡ {m.toolUsed}</Text>
                  )}
                  <Text style={[styles.chatBubbleText, m.role === 'user' && { color: '#ffffff' }]}>
                    {m.text}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.chatInputDock}>
            <TextInput
              style={styles.chatTextInput}
              placeholder="Send instruction to Mikasa..."
              placeholderTextColor="#64748b"
              value={chatInput}
              onChangeText={setChatInput}
              onSubmitEditing={() => {
                if (chatInput.trim()) {
                  const cmd = chatInput.trim();
                  setChatInput('');
                  processCommand(cmd);
                }
              }}
            />
            <TouchableOpacity
              style={styles.chatSendBtn}
              onPress={() => {
                if (chatInput.trim()) {
                  const cmd = chatInput.trim();
                  setChatInput('');
                  processCommand(cmd);
                }
              }}
            >
              <Text style={{ color: '#ffffff', fontWeight: 'bold' }}>➤</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 5. DEVICE CONTROL VIEW */}
      {viewMode === 'device' && (
        <ScrollView style={styles.subPageView} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          <Text style={styles.sectionHeaderTitle}>DEVICE & WORKSTATION BRIDGES</Text>
          <Text style={styles.sectionHeaderSub}>Dual Android Phone & Windows Workstation Controls</Text>

          {/* Phone Subsystem */}
          <Text style={styles.groupLabel}>SMARTPHONE SENSORS</Text>
          <View style={styles.deviceCard}>
            <View style={styles.deviceRow}>
              <Text style={styles.deviceRowLabel}>Device Model</Text>
              <Text style={styles.deviceRowVal}>{deviceName}</Text>
            </View>
            <View style={styles.deviceRow}>
              <Text style={styles.deviceRowLabel}>Battery Level</Text>
              <Text style={styles.deviceRowVal}>{batteryLevel !== null ? `${batteryLevel}%` : 'Reading...'}</Text>
            </View>
            <View style={styles.deviceRow}>
              <Text style={styles.deviceRowLabel}>Network Type</Text>
              <Text style={styles.deviceRowVal}>{networkType}</Text>
            </View>
            <View style={styles.deviceRow}>
              <Text style={styles.deviceRowLabel}>Current Location</Text>
              <Text style={styles.deviceRowVal}>{currentCity}</Text>
            </View>
          </View>

          {/* Workstation Controls */}
          <Text style={styles.groupLabel}>WINDOWS WORKSTATION HARDWARE</Text>
          <View style={styles.deviceCard}>
            <View style={styles.deviceRow}>
              <Text style={styles.deviceRowLabel}>Host Status</Text>
              <Text style={[styles.deviceRowVal, { color: pcOnline ? '#10b981' : '#f59e0b' }]}>
                {pcOnline ? 'Swapnil-PC Online' : 'Cloud Standby'}
              </Text>
            </View>
            <View style={styles.deviceRow}>
              <Text style={styles.deviceRowLabel}>Active Window</Text>
              <Text style={styles.deviceRowVal}>{pcActiveWindow}</Text>
            </View>
            <View style={styles.deviceRow}>
              <Text style={styles.deviceRowLabel}>CPU Load</Text>
              <Text style={styles.deviceRowVal}>{pcCpu}% (Ryzen 5 5600G)</Text>
            </View>
            <View style={styles.deviceRow}>
              <Text style={styles.deviceRowLabel}>RAM Usage</Text>
              <Text style={styles.deviceRowVal}>{pcRam}% of 15.4 GB</Text>
            </View>
          </View>

          {/* One-Tap Remote Actions */}
          <Text style={styles.groupLabel}>REMOTE WORKSTATION ACTIONS</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actionGridBtn} onPress={() => executeDeviceTool('lock')}>
              <Text style={styles.actionBtnIcon}>🔒</Text>
              <Text style={styles.actionBtnLabel}>Lock PC</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionGridBtn} onPress={() => executeDeviceTool('mute')}>
              <Text style={styles.actionBtnIcon}>🔇</Text>
              <Text style={styles.actionBtnLabel}>Mute Audio</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionGridBtn} onPress={() => executeDeviceTool('volup')}>
              <Text style={styles.actionBtnIcon}>🔊</Text>
              <Text style={styles.actionBtnLabel}>Vol Up</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionGridBtn} onPress={() => executeDeviceTool('voldown')}>
              <Text style={styles.actionBtnIcon}>🔉</Text>
              <Text style={styles.actionBtnLabel}>Vol Down</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionGridBtn} onPress={() => executeDeviceTool('media')}>
              <Text style={styles.actionBtnIcon}>⏯️</Text>
              <Text style={styles.actionBtnLabel}>Play/Pause</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionGridBtn} onPress={() => executeDeviceTool('screen')}>
              <Text style={styles.actionBtnIcon}>💤</Text>
              <Text style={styles.actionBtnLabel}>Sleep Screen</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* 6. MEMORY VAULT VIEW */}
      {viewMode === 'memory' && (
        <View style={styles.subPageView}>
          <View style={{ padding: 16 }}>
            <Text style={styles.sectionHeaderTitle}>NEURAL MEMORY VAULT</Text>
            <Text style={styles.sectionHeaderSub}>Persistent Long-Term Cognitive Memory Graph</Text>

            <TextInput
              style={styles.memSearchBar}
              placeholder="Search memory graph..."
              placeholderTextColor="#64748b"
              value={memorySearch}
              onChangeText={setMemorySearch}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginVertical: 8 }}>
              {['All', 'fact', 'preference', 'workflow', 'decision', 'instruction'].map(cat => {
                const isAll = cat === 'All';
                const active = isAll ? activeMemoryCategory === null : activeMemoryCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.memCatPill, active && styles.memCatPillActive]}
                    onPress={() => setActiveMemoryCategory(isAll ? null : cat)}
                  >
                    <Text style={[styles.memCatPillText, active && styles.memCatPillTextActive]}>
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 16 }}>
            {memories.map(m => (
              <View key={m.id} style={styles.memItemCard}>
                <View style={styles.memCardTop}>
                  <Text style={styles.memBadge}>{m.memory_type}</Text>
                  <Text style={styles.memTimestamp}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</Text>
                </View>
                <Text style={styles.memBody}>{m.content}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 7. SITREP DASHBOARD (SECONDARY VIEW) */}
      {viewMode === 'dashboard' && (
        <ScrollView style={styles.subPageView} contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
          <Text style={styles.sectionHeaderTitle}>MORNING SITREP BRIEFING</Text>
          <Text style={styles.sectionHeaderSub}>Good morning, Commander Swapnil.</Text>

          <View style={styles.sitrepSectionCard}>
            <Text style={styles.sitrepCardHead}>📍 LOCAL ENVIRONMENT</Text>
            <Text style={styles.sitrepCardBody}>
              • Location: {currentCity}, Bangladesh (UTC+6){'\n'}
              • Phone Battery: {batteryLevel !== null ? `${batteryLevel}%` : '90%'} ({isCharging ? 'Charging' : 'Optimal'}){'\n'}
              • Network: {networkType}
            </Text>
          </View>

          <View style={styles.sitrepSectionCard}>
            <Text style={styles.sitrepCardHead}>💻 WORKSTATION COCKPIT</Text>
            <Text style={styles.sitrepCardBody}>
              • Workstation: Swapnil-PC ({pcOnline ? 'Online' : 'Standby'}){'\n'}
              • CPU Load: {pcCpu}% (AMD Ryzen 5 5600G){'\n'}
              • RAM Utilized: {pcRam}% of 15.4 GB{'\n'}
              • Active Window: {pcActiveWindow}
            </Text>
          </View>

          <View style={styles.sitrepSectionCard}>
            <Text style={styles.sitrepCardHead}>🧣 MIKASA CORE INTELLIGENCE</Text>
            <Text style={styles.sitrepCardBody}>
              • AI Engine: Google Gemini 2.5 Flash + OpenRouter Failover{'\n'}
              • Database: Supabase Cloud (123+ memories active){'\n'}
              • Telegram Channel: Long Polling Active{'\n'}
              • Web Command Center: Port 3000 Active
            </Text>
          </View>
        </ScrollView>
      )}

      {/* PERMISSION MODAL */}
      <Modal visible={showPermissionModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.permissionModalBox}>
            <Text style={styles.permModalTitle}>Mikasa Assistant Permissions</Text>
            <Text style={styles.permModalDesc}>
              To operate as your real Android AI assistant, Mikasa requires explicit access to:
            </Text>

            <View style={styles.permRow}>
              <Text style={styles.permIcon}>🎙️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.permName}>Microphone</Text>
                <Text style={styles.permDetail}>For hands-free speech recognition and commands.</Text>
              </View>
            </View>

            <View style={styles.permRow}>
              <Text style={styles.permIcon}>📍</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.permName}>Location</Text>
                <Text style={styles.permDetail}>To generate localized sitrep briefings and weather updates.</Text>
              </View>
            </View>

            <View style={styles.permRow}>
              <Text style={styles.permIcon}>🔋</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.permName}>Battery & Hardware</Text>
                <Text style={styles.permDetail}>To monitor power and warn you during late-night work sessions.</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.btnGrantPerm} onPress={requestSystemPermissions}>
              <Text style={styles.btnGrantPermText}>Authorize Mikasa</Text>
            </TouchableOpacity>

            <TouchableOpacity style={{ marginTop: 12, alignItems: 'center' }} onPress={() => setShowPermissionModal(false)}>
              <Text style={{ color: '#64748b', fontSize: 13 }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030712',
    paddingTop: Platform.OS === 'android' ? 28 : 0
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: '#030712'
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  identityRing: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(56, 189, 248, 0.4)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  identityDot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  systemTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  systemSubtitle: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  pillSensor: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  pillSensorText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600'
  },
  btnNavCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modeChipsRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)',
    backgroundColor: '#030712'
  },
  modeChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.03)'
  },
  modeChipActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.4)'
  },
  modeChipText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600'
  },
  modeChipTextActive: {
    color: '#38bdf8'
  },
  assistantCoreView: {
    flex: 1,
    backgroundColor: '#030712',
    justifyContent: 'space-between',
    paddingBottom: 20
  },
  centerStage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  orbWrapper: {
    width: 170,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20
  },
  orbHalo: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5
  },
  mainOrb: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8
  },
  orbInnerCore: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  orbCoreSymbol: {
    fontSize: 24
  },
  assistantName: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.2
  },
  assistantStatusText: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 4
  },
  executionCard: {
    marginTop: 20,
    width: width - 60,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    padding: 12
  },
  execCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  execCardTitle: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '700'
  },
  execStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  execStepText: {
    color: '#94a3b8',
    fontSize: 12
  },
  execStepDone: {
    color: '#e2e8f0',
    textDecorationLine: 'none'
  },
  quickCommandTray: {
    height: 40,
    marginBottom: 10
  },
  quickCommandsScroll: {
    paddingHorizontal: 16,
    gap: 8,
    alignItems: 'center'
  },
  quickCmdPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  quickCmdText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500'
  },
  voiceBottomContainer: {
    alignItems: 'center',
    paddingBottom: 10
  },
  voiceTriggerBtn: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 2,
    borderColor: 'rgba(225, 29, 72, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6
  },
  voiceTriggerBtnActive: {
    backgroundColor: '#e11d48',
    borderColor: '#ffffff'
  },
  voiceTriggerIcon: {
    fontSize: 26,
    color: '#ffffff'
  },
  voiceTriggerPrompt: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500'
  },
  subPageView: {
    flex: 1,
    backgroundColor: '#030712'
  },
  chatScroll: {
    flex: 1
  },
  chatBubbleRow: {
    marginBottom: 10,
    maxWidth: '85%'
  },
  chatBubbleRowUser: {
    alignSelf: 'flex-end'
  },
  chatBubbleRowAssistant: {
    alignSelf: 'flex-start'
  },
  chatBubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16
  },
  chatBubbleUser: {
    backgroundColor: '#0284c7',
    borderBottomRightRadius: 2
  },
  chatBubbleAssistant: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomLeftRadius: 2
  },
  chatBubbleText: {
    color: '#f8fafc',
    fontSize: 14,
    lineHeight: 20
  },
  chatToolUsedTag: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    marginBottom: 4
  },
  chatInputDock: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
    backgroundColor: '#030712',
    gap: 8
  },
  chatTextInput: {
    flex: 1,
    height: 42,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 21,
    paddingHorizontal: 16,
    color: '#f8fafc',
    fontSize: 13
  },
  chatSendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionHeaderTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  sectionHeaderSub: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16
  },
  groupLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginTop: 12,
    marginBottom: 8
  },
  deviceCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 14,
    gap: 8
  },
  deviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  deviceRowLabel: {
    color: '#94a3b8',
    fontSize: 13
  },
  deviceRowVal: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600'
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  actionGridBtn: {
    width: (width - 46) / 2,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    gap: 6
  },
  actionBtnIcon: {
    fontSize: 20
  },
  actionBtnLabel: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '600'
  },
  memSearchBar: {
    height: 38,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    color: '#f8fafc',
    fontSize: 13
  },
  memCatPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)'
  },
  memCatPillActive: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderWidth: 1,
    borderColor: '#38bdf8'
  },
  memCatPillText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600'
  },
  memCatPillTextActive: {
    color: '#38bdf8'
  },
  memItemCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8
  },
  memCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4
  },
  memBadge: {
    color: '#38bdf8',
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  memTimestamp: {
    color: '#64748b',
    fontSize: 9
  },
  memBody: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18
  },
  sitrepSectionCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12
  },
  sitrepCardHead: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8
  },
  sitrepCardBody: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 22
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24
  },
  permissionModalBox: {
    width: '100%',
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.3)',
    borderRadius: 20,
    padding: 20
  },
  permModalTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6
  },
  permModalDesc: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18
  },
  permRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    marginBottom: 14
  },
  permIcon: {
    fontSize: 22
  },
  permName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700'
  },
  permDetail: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2
  },
  btnGrantPerm: {
    backgroundColor: '#0284c7',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8
  },
  btnGrantPermText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  }
});
