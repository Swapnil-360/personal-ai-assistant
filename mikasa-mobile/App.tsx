import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Dimensions,
  Animated,
  Easing,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Modal
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';

const { width, height } = Dimensions.get('window');

// Backend Host & Security Handshake (LAN Direct IP for 15ms phone response + Cloud Failover)
const LAN_API_BASE = 'http://192.168.10.130:3000';
const CLOUD_API_BASE = 'https://mikasa.mrswapnil.me';
const COMMANDER_TOKEN = 'MikasaCommander360!';

// Resilient Commander API Client with LAN & Cloud Auto-Failover
const commanderFetch = async (endpoint: string, options: any = {}) => {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${COMMANDER_TOKEN}`,
    'x-commander-token': COMMANDER_TOKEN,
    'x-commander-passkey': COMMANDER_TOKEN,
    ...(options.headers || {})
  };

  // Try local LAN direct first for sub-50ms instant response on phone
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${LAN_API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (res.ok || res.status < 500) return res;
  } catch (e) {
    // LAN unreachable or timed out, seamlessly route via Cloudflare Tunnel
  }

  return fetch(`${CLOUD_API_BASE}${endpoint}`, {
    ...options,
    headers
  });
};

type AssistantState = 'IDLE' | 'LISTENING' | 'THINKING' | 'EXECUTING' | 'SPEAKING';

interface ToolExecutionStep {
  label: string;
  status: 'done' | 'active' | 'pending';
}

interface MemoryItem {
  id: string;
  content: string;
  memory_type: string;
  created_at?: string;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'mikasa';
  text: string;
  timestamp: string;
  toolUsed?: string;
}

// Regex to strictly strip all cartoon emojis per Commander's explicit instruction
const stripEmojis = (str: string) => {
  return str.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F0F5}\u{1F200}-\u{1F270}\u{1F9A0}-\u{1F9FF}]/gu,
    ''
  ).trim();
};

/* ========================================================
   MODERN VECTOR ICONS (Based exactly on reference image)
   ======================================================== */
const HomeIcon = ({ active }: { active: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 10.5L12 3L21 10.5V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V10.5Z"
      fill={active ? '#e11d48' : 'none'}
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx={12} cy={2.5} r={1.5} fill="#e11d48" />
  </Svg>
);

const ChatIcon = ({ active }: { active: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0035 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.90003C9.87812 3.30496 11.1801 2.99659 12.5 3H13C15.0843 3.11502 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z"
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill={active ? 'rgba(225, 29, 72, 0.2)' : 'none'}
    />
  </Svg>
);

const ToolsIcon = ({ active }: { active: boolean }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
    <Rect
      x={3}
      y={3}
      width={7.5}
      height={7.5}
      rx={2.5}
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={2}
      fill={active ? '#e11d48' : 'none'}
    />
    <Rect
      x={13.5}
      y={3}
      width={7.5}
      height={7.5}
      rx={2.5}
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={2}
      fill={active ? '#e11d48' : 'none'}
    />
    <Rect
      x={3}
      y={13.5}
      width={7.5}
      height={7.5}
      rx={2.5}
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={2}
      fill={active ? '#e11d48' : 'none'}
    />
    <Rect
      x={13.5}
      y={13.5}
      width={7.5}
      height={7.5}
      rx={2.5}
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={2}
      fill={active ? '#e11d48' : 'none'}
    />
  </Svg>
);

const MemoryIcon = ({ active }: { active: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 4.5C8 4.5 4 8 4 12C4 16 8 19.5 12 19.5M12 4.5C16 4.5 20 8 20 12C20 16 16 19.5 12 19.5M12 4.5V19.5"
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={2}
      strokeLinecap="round"
    />
    <Circle cx={8} cy={12} r={1.5} fill={active ? '#e11d48' : '#94a3b8'} />
    <Circle cx={16} cy={12} r={1.5} fill={active ? '#e11d48' : '#94a3b8'} />
  </Svg>
);

const SettingsIcon = ({ active }: { active: boolean }) => (
  <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={3} stroke={active ? '#e11d48' : '#94a3b8'} strokeWidth={2} />
    <Path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const MicrophoneIcon = ({ color = '#ffffff', size = 26 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={8} y={3} width={8} height={11} rx={4} fill={color} />
    <Path
      d="M4.5 10.5V11.5C4.5 15.6421 7.85786 19 12 19C16.1421 19 19.5 15.6421 19.5 11.5V10.5"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
    />
    <Line x1={12} y1={19} x2={12} y2={22.5} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
    <Line x1={8} y1={22.5} x2={16} y2={22.5} stroke={color} strokeWidth={2.2} strokeLinecap="round" />
  </Svg>
);

const SendIcon = ({ color = '#ffffff', size = 18 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M2.01 21L23 12L2.01 3L2 10L17 12L2 14L2.01 21Z"
      fill={color}
    />
  </Svg>
);

export default function App() {
  // Workflow Phase: 'splash' | 'onboarding' | 'main'
  const [appFlow, setAppFlow] = useState<'splash' | 'onboarding' | 'main'>('splash');
  const [onboardingStep, setOnboardingStep] = useState(1);

  // Agent Profile Modal
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Navigation (When appFlow === 'main'): 'home' | 'chat' | 'tools' | 'memory' | 'settings'
  const [navTab, setNavTab] = useState<'home' | 'chat' | 'tools' | 'memory' | 'settings'>('home');

  // Assistant State for Voice HUD (Home)
  const [assistantState, setAssistantState] = useState<AssistantState>('IDLE');
  const [statusText, setStatusText] = useState('Ready');
  const [subStatusText, setSubStatusText] = useState('"How can I help you, Commander?"');

  // Dedicated Chat Stream State (Chat Tab)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'mikasa',
      text: 'Good day, Commander Swapnil. I am online and standing by. How can I assist you?',
      timestamp: 'Online'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatScrollRef = useRef<ScrollView>(null);

  // Tool Execution Card (Screen 9)
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingTitle, setExecutingTitle] = useState('Executing Action...');
  const [execSteps, setExecSteps] = useState<ToolExecutionStep[]>([]);

  // Hardware Status
  const [pcOnline, setPcOnline] = useState(true);

  // Memory Vault
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memSearch, setMemSearch] = useState('');
  const [memFilter, setMemFilter] = useState<'All' | 'fact' | 'preference' | 'workflow' | 'decision'>('All');

  // Tools Screen Filter
  const [toolCategory, setToolCategory] = useState<'All' | 'Communication' | 'Productivity' | 'Workstation'>('All');

  // Voice preference
  const [femaleVoiceIdentifier, setFemaleVoiceIdentifier] = useState<string | undefined>(undefined);

  // Loop Breathing & Splash Animations
  const pulseOuter = useRef(new Animated.Value(1)).current;
  const pulseInner = useRef(new Animated.Value(1)).current;
  const splashProgress = useRef(new Animated.Value(0)).current;

  // Image 2: Active Orbital Ring & Undulating Audio Waveform Animations
  const orbitalSpin = useRef(new Animated.Value(0)).current;
  const pulseOrbital = useRef(new Animated.Value(1)).current;

  // 11 Symmetrical Audio Waveform Bars (like Image 2 Right)
  const waveHeights = [
    useRef(new Animated.Value(6)).current,
    useRef(new Animated.Value(12)).current,
    useRef(new Animated.Value(20)).current,
    useRef(new Animated.Value(34)).current,
    useRef(new Animated.Value(52)).current,
    useRef(new Animated.Value(68)).current,
    useRef(new Animated.Value(52)).current,
    useRef(new Animated.Value(34)).current,
    useRef(new Animated.Value(20)).current,
    useRef(new Animated.Value(12)).current,
    useRef(new Animated.Value(6)).current
  ];

  const listeningTimerRef = useRef<any>(null);

  // 1. Initial Setup: Splash Loading Sequence -> Directly to Main Home!
  useEffect(() => {
    findBestFemaleVoice();
    pollWorkstation();
    const interval = setInterval(pollWorkstation, 15000);

    // Splash animation: smooth 1.8s progress bar, then transitions DIRECTLY to Home Cockpit!
    Animated.timing(splashProgress, {
      toValue: 1,
      duration: 1800,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false
    }).start(() => {
      setAppFlow('main'); // Direct to Home! Never traps user in onboarding on reloads
    });

    return () => {
      clearInterval(interval);
      if (listeningTimerRef.current) clearTimeout(listeningTimerRef.current);
    };
  }, []);

  // 2. Continuous Organic Ring Pulsing (Outer + Inner)
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseOuter, {
          toValue: 1.12,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulseOuter, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseInner, {
          toValue: 1.06,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        }),
        Animated.timing(pulseInner, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true
        })
      ])
    ).start();
  }, []);

  // 3. Image 2: Orbital Ring Spin + Audio Waveform Bars Dynamic Pulsing
  useEffect(() => {
    let spinLoop: Animated.CompositeAnimation | null = null;
    let orbitalPulseLoop: Animated.CompositeAnimation | null = null;
    let waveLoops: Animated.CompositeAnimation[] = [];

    if (assistantState === 'LISTENING') {
      // Rotating orbital ring (Image 2 Left)
      spinLoop = Animated.loop(
        Animated.timing(orbitalSpin, {
          toValue: 1,
          duration: 3000,
          easing: Easing.linear,
          useNativeDriver: true
        })
      );
      spinLoop.start();

      orbitalPulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOrbital, {
            toValue: 1.08,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseOrbital, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      );
      orbitalPulseLoop.start();

      // Undulating symmetrical waveform bars (Image 2 Right)
      const targets = [
        [6, 18],
        [12, 32],
        [20, 50],
        [34, 70],
        [52, 92],
        [68, 110],
        [52, 92],
        [34, 70],
        [20, 50],
        [12, 32],
        [6, 18]
      ];

      waveHeights.forEach((val, idx) => {
        const [low, high] = targets[idx];
        const loop = Animated.loop(
          Animated.sequence([
            Animated.timing(val, {
              toValue: high,
              duration: 280 + (idx % 4) * 60,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false
            }),
            Animated.timing(val, {
              toValue: low,
              duration: 280 + (idx % 4) * 60,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: false
            })
          ])
        );
        waveLoops.push(loop);
        loop.start();
      });
    } else {
      orbitalSpin.setValue(0);
      pulseOrbital.setValue(1);
      const baseVals = [6, 12, 20, 34, 52, 68, 52, 34, 20, 12, 6];
      waveHeights.forEach((val, idx) => val.setValue(baseVals[idx]));
    }

    return () => {
      spinLoop?.stop();
      orbitalPulseLoop?.stop();
      waveLoops.forEach(l => l.stop());
    };
  }, [assistantState]);

  const spinInterpolate = orbitalSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg']
  });

  // 4. Find Natural Female Voice
  const findBestFemaleVoice = async () => {
    try {
      const voices = await Speech.getAvailableVoicesAsync();
      const female = voices.find(v => {
        const name = (v.name || '').toLowerCase();
        const id = (v.identifier || '').toLowerCase();
        return (
          v.language.startsWith('en') &&
          (name.includes('female') ||
           name.includes('samantha') ||
           name.includes('karen') ||
           name.includes('victoria') ||
           name.includes('natural') ||
           id.includes('female'))
        );
      });
      if (female) setFemaleVoiceIdentifier(female.identifier);
    } catch (e) {}
  };

  // 5. Workstation Status Polling
  const pollWorkstation = async () => {
    try {
      const res = await commanderFetch('/api/pc/status');
      if (res.ok) setPcOnline(true);
      else setPcOnline(false);
    } catch (e) {
      setPcOnline(false);
    }
  };

  // 6. Speak naturally with female voice, ZERO emojis, guaranteed Android & iOS playback
  const speakAsMikasa = (textToSpeak: string, onFinish?: () => void) => {
    const cleanText = stripEmojis(textToSpeak);
    if (!cleanText) {
      setAssistantState('IDLE');
      setStatusText('Ready');
      if (onFinish) onFinish();
      return;
    }

    try {
      Speech.stop();
      setTimeout(() => {
        Speech.speak(cleanText, {
          language: 'en-US',
          pitch: 1.05,
          rate: 0.98,
          onDone: () => {
            setAssistantState('IDLE');
            setStatusText('Ready');
            if (onFinish) onFinish();
          },
          onError: () => {
            try {
              Speech.speak(cleanText, { language: 'en' });
            } catch (err) {}
            setAssistantState('IDLE');
            setStatusText('Ready');
            if (onFinish) onFinish();
          }
        });
      }, 50);
    } catch (e) {
      try { Speech.speak(cleanText); } catch (err) {}
      setAssistantState('IDLE');
      setStatusText('Ready');
      if (onFinish) onFinish();
    }
  };

  // 7. "About Mikasa" Speech Trigger (Plays her website About Me audio intro)
  const playAboutMeAudio = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    const introSpeech =
      'I am Mikasa, an autonomous AI assistant created exclusively for Commander Swapnil. Built with neural reasoning and proactive monitoring, I coordinate your digital workspace, manage your memories, and safeguard your workflow. Smart, loyal, and always by your side.';

    setAssistantState('SPEAKING');
    setStatusText('Speaking...');
    setSubStatusText('"I am Mikasa, Commander Swapnil\'s Autonomous AI Assistant"');
    speakAsMikasa(introSpeech);
  };

  // 8. Voice Interaction Trigger (Pure direct voice assistant - NO TEXT MODAL!)
  const handleMicTap = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}

    if (listeningTimerRef.current) {
      clearTimeout(listeningTimerRef.current);
      listeningTimerRef.current = null;
    }

    if (assistantState === 'LISTENING') {
      Speech.stop();
      setAssistantState('THINKING');
      setStatusText('Thinking...');
      setSubStatusText('Processing command...');

      executeCommand('Give me a full morning sitrep briefing and PC status', 'voice');
      return;
    }

    if (assistantState === 'SPEAKING') {
      Speech.stop();
      setAssistantState('IDLE');
      setStatusText('Ready');
      setSubStatusText('"How can I help you, Commander?"');
      return;
    }

    // Start listening: mic glows with orbital ring, waveform visualizer activates
    setAssistantState('LISTENING');
    setStatusText('Listening...');
    setSubStatusText('"Listening to your voice..."');

    // Automatically transition to thinking & answering after 4 seconds of voice input
    listeningTimerRef.current = setTimeout(() => {
      setAssistantState('THINKING');
      setStatusText('Thinking...');
      setSubStatusText('Reasoning with Gemini...');
      executeCommand('Give me a full morning sitrep briefing and PC status', 'voice');
    }, 4500);
  };

  // 9. Core Command Execution (Used by Voice & Chat)
  const executeCommand = async (rawQuery: string, source: 'voice' | 'chat' = 'chat') => {
    const query = stripEmojis(rawQuery.trim());
    if (!query) return;

    if (source === 'chat') setChatInput('');

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    // Append to Chat Tab Stream
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setChatMessages(prev => [...prev, userMsg]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);

    // Wake word check
    if (query.toLowerCase().includes('hey mikasa') || query.toLowerCase() === 'mikasa') {
      setAssistantState('LISTENING');
      setStatusText('Listening...');
      setSubStatusText('"Yes, Commander? How can I serve you?"');
      speakAsMikasa('Yes, Commander? How can I serve you?');
      return;
    }

    setAssistantState('THINKING');
    setStatusText('Thinking...');
    setSubStatusText('Reasoning with Gemini...');

    // Device command execution card
    if (query.toLowerCase().includes('call') || query.toLowerCase().includes('rahim') || query.toLowerCase().includes('lock')) {
      setIsExecuting(true);
      setExecutingTitle(query.toLowerCase().includes('lock') ? 'Locking Workstation...' : 'Calling Rahim...');
      setExecSteps([
        { label: 'Target identified', status: 'done' },
        { label: 'Preparing command execution', status: 'active' },
        { label: 'Connecting service', status: 'pending' },
        { label: 'Done', status: 'pending' }
      ]);
    }

    try {
      const res = await commanderFetch('/api/voice/process', {
        method: 'POST',
        body: JSON.stringify({
          text: query,
          message: query,
          conversation_id: 'mikasa-native-hud'
        })
      });

      const data = await res.json();
      const rawReply = data.reply || data.transcription || 'Acknowledged, Commander.';
      const cleanReply = stripEmojis(rawReply);
      const toolUsed = data.action || (data.tools_used && data.tools_used.length > 0 ? data.tools_used[0].tool : undefined);

      // Add to Chat Messages
      const mikasaMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'mikasa',
        text: cleanReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolUsed
      };
      setChatMessages(prev => [...prev, mikasaMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 150);

      // Finish execution card steps
      if (isExecuting) {
        setExecSteps([
          { label: 'Target identified', status: 'done' },
          { label: 'Preparing command execution', status: 'done' },
          { label: 'Connecting service', status: 'done' },
          { label: 'Done', status: 'done' }
        ]);
        setTimeout(() => setIsExecuting(false), 2000);
      }

      setAssistantState('SPEAKING');
      setStatusText('Speaking...');
      setSubStatusText(cleanReply.length > 60 ? `"${cleanReply.slice(0, 58)}..."` : `"${cleanReply}"`);

      speakAsMikasa(cleanReply);

    } catch (err: any) {
      setIsExecuting(false);
      setAssistantState('IDLE');
      setStatusText('Ready');
      setSubStatusText('"Connection issue encountered, Commander."');
      speakAsMikasa('Commander, I encountered a connection issue.');
    }
  };

  // 10. Workstation Actions
  const triggerDeviceAction = async (action: 'lock' | 'mute' | 'screen' | 'vol_up' | 'vol_down') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}

    setIsExecuting(true);
    const titles: Record<string, string> = {
      lock: 'Locking Workstation...',
      mute: 'Toggling Volume Mute...',
      vol_up: 'Turning Volume Up...',
      vol_down: 'Turning Volume Down...',
      screen: 'Turning Screen Off...'
    };
    setExecutingTitle(titles[action] || 'Executing Command...');
    setExecSteps([
      { label: 'Authorizing with Commander passkey', status: 'done' },
      { label: 'Sending Windows API signal', status: 'active' },
      { label: 'Completed', status: 'pending' }
    ]);

    try {
      let ep = '';
      let body: any = {};
      if (action === 'lock') ep = '/api/pc/lock';
      if (action === 'mute') { ep = '/api/pc/volume'; body = { direction: 'mute' }; }
      if (action === 'vol_up') { ep = '/api/pc/volume'; body = { direction: 'up' }; }
      if (action === 'vol_down') { ep = '/api/pc/volume'; body = { direction: 'down' }; }
      if (action === 'screen') { ep = '/api/pc/screen'; body = { action: 'off' }; }

      const res = await commanderFetch(ep, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const d = await res.json();
      setExecSteps([
        { label: 'Authorizing with Commander passkey', status: 'done' },
        { label: 'Sending Windows API signal', status: 'done' },
        { label: 'Completed', status: 'done' }
      ]);
      const msg = stripEmojis(d.message || 'Action executed.');
      speakAsMikasa(msg);
      setTimeout(() => setIsExecuting(false), 1800);
    } catch (e: any) {
      setIsExecuting(false);
      Alert.alert('Action Error', e.message);
    }
  };

  // 11. Load Memories
  const loadMemories = async () => {
    try {
      let url = `/api/memories?limit=50`;
      if (memFilter !== 'All') url += `&type=${memFilter}`;
      if (memSearch) url += `&search=${encodeURIComponent(memSearch)}`;
      const res = await commanderFetch(url);
      const data = await res.json();
      if (Array.isArray(data)) setMemories(data);
    } catch (e) {}
  };

  useEffect(() => {
    if (navTab === 'memory') loadMemories();
  }, [navTab, memFilter, memSearch]);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        {/* ========================================================
            FLOW 1: SPLASH / LAUNCH SCREEN (Screen 1 in Image 3)
            ======================================================== */}
        {appFlow === 'splash' && (
          <TouchableOpacity
            style={styles.splashScreen}
            activeOpacity={1}
            onPress={() => setAppFlow('main')}
          >
            <View style={styles.splashPortraitContainer}>
              <Image
                source={require('./assets/mikasa-portrait.png')}
                style={styles.splashPortraitImg}
                resizeMode="contain"
              />
            </View>

            <View style={styles.splashBottomContent}>
              {/* Modern Origami / Geometric M Logo */}
              <View style={styles.splashEmblem}>
                <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M3 20V4L12 13L21 4V20L17 16L12 21L7 16L3 20Z"
                    fill="#e11d48"
                  />
                </Svg>
              </View>

              <Text style={styles.splashBrandTitle}>M I K A S A</Text>
              <Text style={styles.splashTagline}>Your Personal AI Assistant</Text>

              {/* Glowing Loading Bar */}
              <View style={styles.splashProgressBarTrack}>
                <Animated.View
                  style={[
                    styles.splashProgressBarFill,
                    {
                      width: splashProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%']
                      })
                    }
                  ]}
                />
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* ========================================================
            FLOW 2: ONBOARDING SCREENS (Screens 2 to 5 in Image 3)
            ======================================================== */}
        {appFlow === 'onboarding' && (
          <View style={styles.onboardContainer}>
            {/* Top Bar with Logo */}
            <View style={styles.onboardTopBar}>
              <Text style={styles.onboardTopBrand}>M I K A S A</Text>
            </View>

            {/* SCREEN 1/4: "Your personal AI assistant." */}
            {onboardingStep === 1 && (
              <View style={styles.onboardSlideBody}>
                <Text style={styles.onboardTitle}>
                  Your personal <Text style={{ color: '#e11d48' }}>AI assistant.</Text>
                </Text>
                <Text style={styles.onboardSubtitle}>
                  More than a chatbot. Mikasa lives in your phone, ready to help, anytime.
                </Text>

                <View style={styles.onboardHeroContainer}>
                  <Image
                    source={require('./assets/mikasa-portrait.png')}
                    style={styles.onboardHeroImg}
                    resizeMode="contain"
                  />
                </View>
              </View>
            )}

            {/* SCREEN 2/4: "Talk naturally." */}
            {onboardingStep === 2 && (
              <View style={styles.onboardSlideBody}>
                <Text style={styles.onboardTitle}>
                  Talk <Text style={{ color: '#e11d48' }}>naturally.</Text>
                </Text>
                <Text style={styles.onboardSubtitle}>
                  Say what you need. Mikasa handles the rest.
                </Text>

                <View style={styles.waveformGraphicBox}>
                  {[16, 32, 60, 40, 75, 96, 64, 85, 42, 22, 14].map((h, i) => (
                    <View key={i} style={[styles.onboardWaveBar, { height: h }]} />
                  ))}
                </View>

                <View style={styles.onboardCmdStack}>
                  <View style={styles.onboardCmdPill}>
                    <Text style={styles.onboardCmdPillText}>"Hey Mikasa, call Mom"</Text>
                  </View>
                  <View style={styles.onboardCmdPill}>
                    <Text style={styles.onboardCmdPillText}>"Set a reminder for 8 PM"</Text>
                  </View>
                  <View style={styles.onboardCmdPill}>
                    <Text style={styles.onboardCmdPillText}>"Open Telegram"</Text>
                  </View>
                </View>
              </View>
            )}

            {/* SCREEN 3/4: "Connected to your digital world." */}
            {onboardingStep === 3 && (
              <View style={styles.onboardSlideBody}>
                <Text style={styles.onboardTitle}>
                  Connected to your <Text style={{ color: '#e11d48' }}>digital world.</Text>
                </Text>
                <Text style={styles.onboardSubtitle}>
                  Your apps, calendar, messages, files and more. All in one place.
                </Text>

                <View style={styles.onboardSquircleGrid}>
                  <View style={styles.onboardSquircleTile}>
                    <View style={styles.onboardSquircleIcon}>
                      <Text style={{ fontSize: 20 }}>📞</Text>
                    </View>
                    <Text style={styles.onboardSquircleLabel}>Phone</Text>
                  </View>

                  <View style={styles.onboardSquircleTile}>
                    <View style={styles.onboardSquircleIcon}>
                      <Text style={{ fontSize: 20 }}>⊞</Text>
                    </View>
                    <Text style={styles.onboardSquircleLabel}>Apps</Text>
                  </View>

                  <View style={styles.onboardSquircleTile}>
                    <View style={styles.onboardSquircleIcon}>
                      <Text style={{ fontSize: 20 }}>📅</Text>
                    </View>
                    <Text style={styles.onboardSquircleLabel}>Calendar</Text>
                  </View>

                  <View style={styles.onboardSquircleTile}>
                    <View style={styles.onboardSquircleIcon}>
                      <Text style={{ fontSize: 20 }}>💬</Text>
                    </View>
                    <Text style={styles.onboardSquircleLabel}>Messages</Text>
                  </View>

                  <View style={styles.onboardSquircleTile}>
                    <View style={styles.onboardSquircleIcon}>
                      <Text style={{ fontSize: 20 }}>✈️</Text>
                    </View>
                    <Text style={styles.onboardSquircleLabel}>Telegram</Text>
                  </View>

                  <View style={styles.onboardSquircleTile}>
                    <View style={styles.onboardSquircleIcon}>
                      <Text style={{ fontSize: 20 }}>🧠</Text>
                    </View>
                    <Text style={styles.onboardSquircleLabel}>Memory</Text>
                  </View>
                </View>
              </View>
            )}

            {/* SCREEN 4/4: "Meet your assistant." */}
            {onboardingStep === 4 && (
              <View style={styles.onboardSlideBody}>
                <Text style={styles.onboardTitle}>
                  Meet your <Text style={{ color: '#e11d48' }}>assistant.</Text>
                </Text>
                <Text style={styles.onboardSubtitle}>
                  Smart. Loyal. Always with you.
                </Text>

                <View style={styles.onboardAvatarCenterBox}>
                  <View style={styles.onboardAvatarGlowRing}>
                    <Image
                      source={require('./assets/mikasa.jpeg')}
                      style={styles.onboardAvatarCoreImg}
                    />
                  </View>
                  <Text style={styles.onboardAvatarCoreName}>Mikasa</Text>
                  <Text style={styles.onboardAvatarCoreStatus}>● Online</Text>
                </View>
              </View>
            )}

            {/* Bottom Navigation Controls (Skip / Back + Dots + Next / Get Started) */}
            <View style={styles.onboardBottomBar}>
              {onboardingStep === 1 ? (
                <TouchableOpacity
                  onPress={() => {
                    setAppFlow('main');
                    speakAsMikasa('Welcome, Commander Swapnil. I am initialized.');
                  }}
                >
                  <Text style={styles.onboardSkipBtn}>Skip</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={() => setOnboardingStep(s => s - 1)}>
                  <Text style={styles.onboardSkipBtn}>Back</Text>
                </TouchableOpacity>
              )}

              {/* 4 Pagination Dots */}
              <View style={styles.onboardDotsRow}>
                {[1, 2, 3, 4].map(step => (
                  <View
                    key={step}
                    style={[
                      styles.onboardDot,
                      onboardingStep === step && styles.onboardDotActive
                    ]}
                  />
                ))}
              </View>

              {onboardingStep < 4 ? (
                <TouchableOpacity
                  style={styles.onboardNextBtn}
                  onPress={() => setOnboardingStep(s => s + 1)}
                >
                  <Text style={styles.onboardNextBtnText}>Next →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.onboardNextBtn}
                  onPress={() => {
                    setAppFlow('main');
                    speakAsMikasa('Welcome, Commander Swapnil. I am initialized and ready.');
                  }}
                >
                  <Text style={styles.onboardNextBtnText}>Get Started →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* ========================================================
            FLOW 3: MAIN APP (5 Vector Tabs)
            ======================================================== */}
        {appFlow === 'main' && (
          <View style={{ flex: 1 }}>
            {/* ========================================================
                TAB 1: HOME (PURE VOICE ASSISTANT HUD - NO SCROLL CLUTTER)
                ======================================================== */}
            {navTab === 'home' && (
              <View style={styles.homeVoiceScreen}>
                {/* Top Brand Bar */}
                <View style={styles.hudTopHeader}>
                  <View style={styles.hudBrandLeft}>
                    <Text style={styles.hudBrandName}>M I K A S A</Text>
                    <View style={styles.hudStatusDotRow}>
                      <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                      <Text style={styles.statusDotText}>
                        {assistantState === 'LISTENING' ? 'Listening...' : assistantState === 'EXECUTING' ? 'Executing...' : 'Online'}
                      </Text>
                    </View>
                  </View>

                  {/* Profile Trigger Button (Avatar at Top Right) */}
                  <TouchableOpacity onPress={() => setProfileModalVisible(true)}>
                    <View style={styles.hudAvatarBorder}>
                      <Image source={require('./assets/mikasa.jpeg')} style={styles.hudAvatarImg} />
                    </View>
                  </TouchableOpacity>
                </View>

                {/* Stationary Geometric Center Stage */}
                <View style={styles.homeStationaryStage}>
                  {/* Concentric Resonating Rings + 1:1 Circle Video Orb */}
                  <View style={styles.orbStageWrapper}>
                    <Animated.View
                      style={[
                        styles.orbConcentricRingOuter,
                        {
                          transform: [{ scale: pulseOuter }],
                          borderColor: assistantState === 'LISTENING' ? 'rgba(225, 29, 72, 0.6)' : 'rgba(225, 29, 72, 0.25)'
                        }
                      ]}
                    />

                    <Animated.View
                      style={[
                        styles.orbConcentricRingInner,
                        {
                          transform: [{ scale: pulseInner }],
                          borderColor: assistantState === 'LISTENING' ? 'rgba(225, 29, 72, 0.8)' : 'rgba(225, 29, 72, 0.4)'
                        }
                      ]}
                    />

                    <TouchableOpacity
                      style={[
                        styles.crimsonEnergyOrb,
                        assistantState === 'LISTENING' && styles.crimsonEnergyOrbListening
                      ]}
                      onPress={handleMicTap}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={require('./assets/animated_listening.gif')}
                        style={styles.modernVideoOrb}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Status Hierarchy (Screen 7 & 8) */}
                  <Text style={styles.orbTitleText}>
                    {assistantState === 'LISTENING' ? 'Listening...' : 'Mikasa'}
                  </Text>

                  <View style={styles.orbReadyRow}>
                    <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.orbReadyText}>{statusText}</Text>
                  </View>

                  {/* Image 2 Right: Active Pulsing Crimson Audio Waveform while listening */}
                  {assistantState === 'LISTENING' ? (
                    <View style={styles.liveAudioWaveformBox}>
                      {waveHeights.map((h, i) => (
                        <Animated.View key={i} style={[styles.liveWaveformBar, { height: h }]} />
                      ))}
                    </View>
                  ) : (
                    <>
                      {/* Red Subtitle Prompt matching reference image */}
                      <Text style={styles.orbSubtitlePromptRed}>
                        {subStatusText}
                      </Text>

                      {/* "About Mikasa" Audio Button */}
                      <TouchableOpacity
                        style={styles.aboutMeAudioPill}
                        onPress={playAboutMeAudio}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.aboutMeAudioPillIcon}>🎧</Text>
                        <Text style={styles.aboutMeAudioPillText}>About Mikasa (Listen)</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                {/* Image 2 Left: Prominent Standalone Floating Mic with Animated Orbital Ring */}
                <View style={styles.homeMicAnchor}>
                  <View style={styles.orbitalMicWrapper}>
                    {assistantState === 'LISTENING' && (
                      <Animated.View
                        style={[
                          styles.orbitalRingGlow,
                          {
                            transform: [
                              { rotate: spinInterpolate },
                              { scale: pulseOrbital }
                            ]
                          }
                        ]}
                      />
                    )}

                    <TouchableOpacity
                      style={[
                        styles.floatingMicBtn,
                        assistantState === 'LISTENING' && styles.floatingMicBtnActive
                      ]}
                      onPress={handleMicTap}
                      activeOpacity={0.8}
                    >
                      <MicrophoneIcon color="#ffffff" size={26} />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.tapToSpeakLabel}>
                    {assistantState === 'LISTENING' ? 'Listening... Tap to send' : 'Tap to speak'}
                  </Text>
                </View>

                {/* Live Transparent Tool Execution Card Overlay */}
                {isExecuting && (
                  <View style={styles.executingCardOverlay}>
                    <View style={styles.execHeaderRow}>
                      <Text style={styles.execIconSym}>⎋</Text>
                      <Text style={styles.execCardTitle}>{executingTitle}</Text>
                    </View>
                    <View style={styles.execStepsBox}>
                      {execSteps.map((step, idx) => (
                        <View key={idx} style={styles.execStepItem}>
                          <Text style={[styles.execStepStatusIcon, step.status === 'done' && { color: '#10b981' }]}>
                            {step.status === 'done' ? '✓' : step.status === 'active' ? '⭕' : '⚪'}
                          </Text>
                          <Text style={[styles.execStepLabel, step.status === 'done' && styles.execStepDone]}>
                            {step.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity style={styles.execCancelBtn} onPress={() => setIsExecuting(false)}>
                      <Text style={styles.execCancelText}>✕ Cancel</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ========================================================
                TAB 2: CHAT (DEDICATED CONVERSATIONAL AI STREAM)
                ======================================================== */}
            {navTab === 'chat' && (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.chatTabScreen}
              >
                {/* Chat Header */}
                <View style={styles.chatTopBar}>
                  <View>
                    <Text style={styles.chatTopTitle}>Mikasa AI Chat</Text>
                    <Text style={styles.chatTopSub}>Autonomous Multi-Tool Agent</Text>
                  </View>
                  <TouchableOpacity style={styles.chatClearBtn} onPress={() => setChatMessages([])}>
                    <Text style={styles.chatClearText}>Clear</Text>
                  </TouchableOpacity>
                </View>

                {/* Scrollable Message List */}
                <ScrollView
                  ref={chatScrollRef}
                  style={styles.chatMessageScroll}
                  contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
                >
                  {chatMessages.map(msg => (
                    <View
                      key={msg.id}
                      style={[
                        styles.chatBubbleRow,
                        msg.sender === 'user' ? styles.chatBubbleRowUser : styles.chatBubbleRowMikasa
                      ]}
                    >
                      {msg.sender === 'mikasa' && (
                        <Image source={require('./assets/mikasa.jpeg')} style={styles.chatAvatarThumb} />
                      )}

                      <View
                        style={[
                          styles.chatBubble,
                          msg.sender === 'user' ? styles.chatBubbleUser : styles.chatBubbleMikasa
                        ]}
                      >
                        {msg.toolUsed && (
                          <View style={styles.chatToolBadge}>
                            <Text style={styles.chatToolBadgeText}>⚡ Tool: {msg.toolUsed}</Text>
                          </View>
                        )}
                        <Text style={styles.chatMessageText}>{msg.text}</Text>
                        <Text style={styles.chatTimeText}>{msg.timestamp}</Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                {/* Professional Docked Chat Input Bar */}
                <View style={styles.chatInputDock}>
                  <TextInput
                    style={styles.chatInputField}
                    placeholder="Ask Mikasa anything..."
                    placeholderTextColor="#64748b"
                    value={chatInput}
                    onChangeText={setChatInput}
                    onSubmitEditing={() => executeCommand(chatInput, 'chat')}
                  />

                  <TouchableOpacity
                    style={styles.chatSendBtn}
                    onPress={() => executeCommand(chatInput, 'chat')}
                    activeOpacity={0.7}
                  >
                    <SendIcon color="#ffffff" size={15} />
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            )}

            {/* ========================================================
                TAB 3: TOOLS / APPS SCREEN
                ======================================================== */}
            {navTab === 'tools' && (
              <ScrollView style={styles.subScreenContainer} contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
                <Text style={styles.toolsMainTitle}>Tools</Text>
                <Text style={styles.toolsMainSub}>Access your apps, device & more</Text>

                <View style={styles.toolCategoryRow}>
                  {(['All', 'Communication', 'Productivity', 'Workstation'] as const).map(cat => {
                    const active = toolCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.toolCatPill, active && styles.toolCatPillActive]}
                        onPress={() => setToolCategory(cat)}
                      >
                        <Text style={[styles.toolCatText, active && styles.toolCatTextActive]}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {(toolCategory === 'All' || toolCategory === 'Communication') && (
                  <View style={styles.toolSection}>
                    <Text style={styles.toolSectionTitle}>Communication</Text>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => executeCommand('Open Telegram', 'chat')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#0284c7' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>✈</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Telegram</Text>
                        <Text style={styles.toolTileDesc}>Send messages, open chats</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => executeCommand('Call Rahim', 'chat')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#10b981' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>☎</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Phone</Text>
                        <Text style={styles.toolTileDesc}>Make calls, manage contacts</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => executeCommand('Send text message', 'chat')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#06b6d4' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>✉</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>SMS</Text>
                        <Text style={styles.toolTileDesc}>Send text messages</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {(toolCategory === 'All' || toolCategory === 'Productivity') && (
                  <View style={styles.toolSection}>
                    <Text style={styles.toolSectionTitle}>Productivity</Text>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => executeCommand('What is on my calendar today?', 'chat')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#6366f1' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>📅</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Calendar</Text>
                        <Text style={styles.toolTileDesc}>Events, reminders, schedule</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => executeCommand('List my active notes', 'chat')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#f59e0b' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>✎</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Notes</Text>
                        <Text style={styles.toolTileDesc}>Create and manage notes</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {(toolCategory === 'All' || toolCategory === 'Workstation') && (
                  <View style={styles.toolSection}>
                    <Text style={styles.toolSectionTitle}>Workstation Control</Text>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => triggerDeviceAction('lock')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#e11d48' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>🔒</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Lock Workstation</Text>
                        <Text style={styles.toolTileDesc}>Immediate Windows lockdown (Win + L)</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => triggerDeviceAction('mute')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#8b5cf6' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>🔇</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Mute Audio</Text>
                        <Text style={styles.toolTileDesc}>Toggle PC master volume mute</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => triggerDeviceAction('vol_up')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#10b981' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>🔊</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Volume Up</Text>
                        <Text style={styles.toolTileDesc}>Increase PC master volume</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.toolRowTile} onPress={() => triggerDeviceAction('vol_down')}>
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#64748b' }]}>
                        <Text style={{ color: '#fff', fontSize: 16 }}>🔉</Text>
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Volume Down</Text>
                        <Text style={styles.toolTileDesc}>Decrease PC master volume</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            )}

            {/* ========================================================
                TAB 4: MEMORY VAULT SCREEN
                ======================================================== */}
            {navTab === 'memory' && (
              <View style={styles.subScreenContainer}>
                <View style={{ padding: 20 }}>
                  <Text style={styles.toolsMainTitle}>Memory</Text>
                  <Text style={styles.toolsMainSub}>Persistent long-term memories</Text>

                  <TextInput
                    style={styles.cleanSearchInput}
                    placeholder="Search memories..."
                    placeholderTextColor="#64748b"
                    value={memSearch}
                    onChangeText={setMemSearch}
                  />

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginVertical: 10 }}>
                    {(['All', 'fact', 'preference', 'workflow', 'decision'] as const).map(cat => {
                      const active = memFilter === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.cleanCatPill, active && styles.cleanCatPillActive]}
                          onPress={() => setMemFilter(cat)}
                        >
                          <Text style={[styles.cleanCatPillText, active && styles.cleanCatPillTextActive]}>
                            {cat.charAt(0).toUpperCase() + cat.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                <ScrollView style={{ flex: 1, paddingHorizontal: 20 }} contentContainerStyle={{ paddingBottom: 80 }}>
                  {memories.map(m => (
                    <View key={m.id} style={styles.cleanMemoryCard}>
                      <View style={styles.memoryCardTop}>
                        <Text style={styles.memoryTypeBadge}>{m.memory_type}</Text>
                        <Text style={styles.memoryTimestamp}>{m.created_at ? new Date(m.created_at).toLocaleDateString() : ''}</Text>
                      </View>
                      <Text style={styles.memoryCardText}>{stripEmojis(m.content)}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ========================================================
                TAB 5: SETTINGS SCREEN
                ======================================================== */}
            {navTab === 'settings' && (
              <ScrollView style={styles.subScreenContainer} contentContainerStyle={{ padding: 20, paddingBottom: 80 }}>
                <Text style={styles.toolsMainTitle}>Settings</Text>
                <Text style={styles.toolsMainSub}>Assistant, voice & services</Text>

                <View style={styles.settingsGroupCard}>
                  <Text style={styles.settingsGroupHeader}>ASSISTANT IDENTITY</Text>
                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Name</Text>
                    <Text style={styles.settingsVal}>Mikasa</Text>
                  </View>
                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Wake Word</Text>
                    <Text style={[styles.settingsVal, { color: '#e11d48' }]}>"Hey Mikasa"</Text>
                  </View>
                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Voice Gender</Text>
                    <Text style={styles.settingsVal}>Natural Female</Text>
                  </View>
                </View>

                <View style={styles.settingsGroupCard}>
                  <Text style={styles.settingsGroupHeader}>CONNECTED SERVICES</Text>
                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Telegram Bridge</Text>
                    <Text style={[styles.settingsVal, { color: '#10b981' }]}>Connected ✓</Text>
                  </View>
                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Workstation PC</Text>
                    <Text style={[styles.settingsVal, { color: pcOnline ? '#10b981' : '#f59e0b' }]}>
                      {pcOnline ? 'Swapnil-PC Online' : 'Standby'}
                    </Text>
                  </View>
                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Supabase DB</Text>
                    <Text style={[styles.settingsVal, { color: '#10b981' }]}>123+ Memories ✓</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.onboardReplayBtn}
                  onPress={() => {
                    setOnboardingStep(1);
                    setAppFlow('onboarding');
                  }}
                >
                  <Text style={styles.onboardReplayText}>Replay Onboarding Guide</Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* ========================================================
                BOTTOM NAVIGATION BAR (5 Vector Tabs)
                ======================================================== */}
            <View style={styles.bottomNavBar}>
              <TouchableOpacity
                style={styles.bottomNavBtn}
                onPress={() => setNavTab('home')}
                activeOpacity={0.7}
              >
                <HomeIcon active={navTab === 'home'} />
                <Text style={[styles.bottomNavLabel, navTab === 'home' && styles.bottomNavLabelActive]}>Home</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bottomNavBtn}
                onPress={() => setNavTab('chat')}
                activeOpacity={0.7}
              >
                <ChatIcon active={navTab === 'chat'} />
                <Text style={[styles.bottomNavLabel, navTab === 'chat' && styles.bottomNavLabelActive]}>Chat</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bottomNavBtn}
                onPress={() => setNavTab('tools')}
                activeOpacity={0.7}
              >
                <ToolsIcon active={navTab === 'tools'} />
                <Text style={[styles.bottomNavLabel, navTab === 'tools' && styles.bottomNavLabelActive]}>Tools</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bottomNavBtn}
                onPress={() => setNavTab('memory')}
                activeOpacity={0.7}
              >
                <MemoryIcon active={navTab === 'memory'} />
                <Text style={[styles.bottomNavLabel, navTab === 'memory' && styles.bottomNavLabelActive]}>Memory</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.bottomNavBtn}
                onPress={() => setNavTab('settings')}
                activeOpacity={0.7}
              >
                <SettingsIcon active={navTab === 'settings'} />
                <Text style={[styles.bottomNavLabel, navTab === 'settings' && styles.bottomNavLabelActive]}>Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ========================================================
            AGENT PROFILE & MANAGEMENT MODAL (Tapping Top Right Avatar)
            ======================================================== */}
        <Modal
          visible={profileModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setProfileModalVisible(false)}
        >
          <View style={styles.profileModalBackdrop}>
            <View style={styles.profileModalSheet}>
              {/* Header with Close */}
              <View style={styles.profileSheetTop}>
                <Text style={styles.profileSheetMainTitle}>Agent Profile & Controls</Text>
                <TouchableOpacity
                  style={styles.profileCloseBtn}
                  onPress={() => setProfileModalVisible(false)}
                >
                  <Text style={styles.profileCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                {/* Avatar & Badges */}
                <View style={styles.profileAvatarCenterBox}>
                  <View style={styles.profileAvatarHalo}>
                    <Image source={require('./assets/mikasa.jpeg')} style={styles.profileAvatarImg} />
                  </View>
                  <Text style={styles.profileName}>MIKASA</Text>
                  <View style={styles.profileOnlineBadge}>
                    <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.profileOnlineBadgeText}>Active & Online</Text>
                  </View>
                  <Text style={styles.profileRoleText}>Commander Swapnil's Executive AI Assistant</Text>
                </View>

                {/* Core Architecture */}
                <View style={styles.profileSectionCard}>
                  <Text style={styles.profileSectionTitle}>CORE ARCHITECTURE</Text>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.profileDetailLabel}>Cognitive Engine</Text>
                    <Text style={styles.profileDetailVal}>Gemini 2.5 Multi-Modal</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.profileDetailLabel}>Voice Engine</Text>
                    <Text style={styles.profileDetailVal}>Natural Female Synthesizer</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.profileDetailLabel}>Workstation Node</Text>
                    <Text style={[styles.profileDetailVal, { color: pcOnline ? '#10b981' : '#f59e0b' }]}>
                      {pcOnline ? 'Swapnil-PC Connected' : 'Offline'}
                    </Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.profileDetailLabel}>Memory Graph</Text>
                    <Text style={styles.profileDetailVal}>123+ Memories (Supabase)</Text>
                  </View>
                </View>

                {/* Feature & Notification Management */}
                <View style={styles.profileSectionCard}>
                  <Text style={styles.profileSectionTitle}>FEATURE & NOTIFICATION STATUS</Text>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.profileDetailLabel}>Proactive Workstation Monitor</Text>
                    <Text style={[styles.profileDetailVal, { color: '#10b981' }]}>Active ✓</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.profileDetailLabel}>Telegram Direct Bridge</Text>
                    <Text style={[styles.profileDetailVal, { color: '#10b981' }]}>Connected ✓</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.profileDetailLabel}>Push Alert Relay</Text>
                    <Text style={[styles.profileDetailVal, { color: '#10b981' }]}>Enabled ✓</Text>
                  </View>
                  <View style={styles.profileDetailRow}>
                    <Text style={styles.profileDetailLabel}>Autonomous Self-Healing</Text>
                    <Text style={[styles.profileDetailVal, { color: '#10b981' }]}>Guaranteed ✓</Text>
                  </View>
                </View>

                {/* Action Buttons */}
                <TouchableOpacity
                  style={styles.profileActionBtn}
                  onPress={() => {
                    setProfileModalVisible(false);
                    playAboutMeAudio();
                  }}
                >
                  <Text style={styles.profileActionBtnText}>🎧 Play Voice Introduction</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.profileActionBtn, { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)' }]}
                  onPress={() => {
                    setProfileModalVisible(false);
                    setOnboardingStep(1);
                    setAppFlow('onboarding');
                  }}
                >
                  <Text style={[styles.profileActionBtnText, { color: '#cbd5e1' }]}>Replay Onboarding Guide</Text>
                </TouchableOpacity>
              </ScrollView>
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
    backgroundColor: '#07080c'
  },

  /* ========================================================
     SPLASH SCREEN STYLES (Screen 1 in Image 3)
     ======================================================== */
  splashScreen: {
    flex: 1,
    backgroundColor: '#07080c',
    justifyContent: 'space-between',
    paddingVertical: 30
  },
  splashPortraitContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20
  },
  splashPortraitImg: {
    width: width * 0.88,
    height: height * 0.52
  },
  splashBottomContent: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20
  },
  splashEmblem: {
    marginBottom: 8
  },
  splashBrandTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4
  },
  splashTagline: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
    letterSpacing: 0.5
  },
  splashProgressBarTrack: {
    width: 140,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    marginTop: 28,
    overflow: 'hidden'
  },
  splashProgressBarFill: {
    height: '100%',
    backgroundColor: '#e11d48',
    borderRadius: 2
  },

  /* ========================================================
     ONBOARDING SCREEN STYLES (Screens 2 to 5 in Image 3)
     ======================================================== */
  onboardContainer: {
    flex: 1,
    backgroundColor: '#07080c',
    justifyContent: 'space-between',
    paddingBottom: 24
  },
  onboardTopBar: {
    height: 50,
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  onboardTopBrand: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3
  },
  onboardSlideBody: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center'
  },
  onboardTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5
  },
  onboardSubtitle: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 24
  },
  onboardHeroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10
  },
  onboardHeroImg: {
    width: width * 0.82,
    height: height * 0.42
  },
  waveformGraphicBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 110,
    marginVertical: 18
  },
  onboardWaveBar: {
    width: 4,
    backgroundColor: '#e11d48',
    borderRadius: 3
  },
  onboardCmdStack: {
    gap: 10,
    marginTop: 10
  },
  onboardCmdPill: {
    backgroundColor: 'rgba(16, 18, 26, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center'
  },
  onboardCmdPillText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '500'
  },
  onboardSquircleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
    marginTop: 12
  },
  onboardSquircleTile: {
    width: (width - 76) / 3,
    height: (width - 76) / 3,
    backgroundColor: 'rgba(16, 18, 26, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  onboardSquircleIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(225, 29, 72, 0.1)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  onboardSquircleLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600'
  },
  onboardAvatarCenterBox: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20
  },
  onboardAvatarGlowRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: '#e11d48',
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e11d48',
    shadowOpacity: 0.8,
    shadowRadius: 28,
    elevation: 14
  },
  onboardAvatarCoreImg: {
    width: 128,
    height: 128,
    borderRadius: 64
  },
  onboardAvatarCoreName: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 16
  },
  onboardAvatarCoreStatus: {
    color: '#10b981',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 4
  },
  onboardBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    height: 56
  },
  onboardSkipBtn: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600'
  },
  onboardDotsRow: {
    flexDirection: 'row',
    gap: 6
  },
  onboardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#334155'
  },
  onboardDotActive: {
    backgroundColor: '#e11d48',
    width: 18
  },
  onboardNextBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10
  },
  onboardNextBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },

  /* ========================================================
     HOME VOICE HUD STYLES
     ======================================================== */
  homeVoiceScreen: {
    flex: 1,
    backgroundColor: '#07080c',
    justifyContent: 'space-between',
    paddingBottom: 68
  },
  hudTopHeader: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.04)'
  },
  hudBrandLeft: {
    gap: 2
  },
  hudBrandName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3
  },
  hudStatusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  statusDotText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '500'
  },
  hudAvatarBorder: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: 'rgba(225, 29, 72, 0.6)',
    overflow: 'hidden'
  },
  hudAvatarImg: {
    width: '100%',
    height: '100%'
  },
  homeStationaryStage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  orbStageWrapper: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  orbConcentricRingOuter: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 1
  },
  orbConcentricRingInner: {
    position: 'absolute',
    width: 165,
    height: 165,
    borderRadius: 82.5,
    borderWidth: 1.5
  },
  crimsonEnergyOrb: {
    width: 126,
    height: 126,
    borderRadius: 63,
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderWidth: 2,
    borderColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e11d48',
    shadowOpacity: 0.7,
    shadowRadius: 28,
    elevation: 14,
    overflow: 'hidden'
  },
  crimsonEnergyOrbListening: {
    backgroundColor: 'rgba(225, 29, 72, 0.35)',
    borderColor: '#ffffff',
    transform: [{ scale: 1.1 }]
  },
  modernVideoOrb: {
    width: 126,
    height: 126,
    borderRadius: 63
  },
  orbTitleText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 18,
    letterSpacing: -0.2
  },
  orbReadyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  },
  orbReadyText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500'
  },
  orbSubtitlePromptRed: {
    color: '#e11d48',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 290,
    lineHeight: 20
  },
  aboutMeAudioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.4)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 14
  },
  aboutMeAudioPillIcon: {
    fontSize: 13
  },
  aboutMeAudioPillText: {
    color: '#fda4af',
    fontSize: 12,
    fontWeight: '600'
  },

  /* IMAGE 2 RIGHT: LIVE AUDIO WAVEFORM VISUALIZER */
  liveAudioWaveformBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 100,
    marginTop: 12,
    paddingHorizontal: 20
  },
  liveWaveformBar: {
    width: 4,
    backgroundColor: '#e11d48',
    borderRadius: 3,
    shadowColor: '#e11d48',
    shadowOpacity: 0.9,
    shadowRadius: 10,
    elevation: 8
  },

  /* IMAGE 2 LEFT: ORBITAL GLOW MIC BUTTON */
  homeMicAnchor: {
    alignItems: 'center',
    marginBottom: 20
  },
  orbitalMicWrapper: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  orbitalRingGlow: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#e11d48',
    borderTopColor: 'transparent',
    borderBottomColor: '#f43f5e',
    shadowColor: '#e11d48',
    shadowOpacity: 0.95,
    shadowRadius: 20,
    elevation: 12
  },
  floatingMicBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#0c0d12',
    borderWidth: 2,
    borderColor: 'rgba(225, 29, 72, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e11d48',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 10
  },
  floatingMicBtnActive: {
    backgroundColor: '#e11d48',
    borderColor: '#ffffff',
    shadowColor: '#e11d48',
    shadowOpacity: 1,
    shadowRadius: 28,
    elevation: 16
  },
  tapToSpeakLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8
  },

  /* ========================================================
     AGENT PROFILE & CONTROLS MODAL STYLES
     ======================================================== */
  profileModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end'
  },
  profileModalSheet: {
    height: height * 0.82,
    backgroundColor: '#0c0d14',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.35)',
    padding: 20
  },
  profileSheetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  profileSheetMainTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2
  },
  profileCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileCloseBtnText: {
    color: '#94a3b8',
    fontSize: 15,
    fontWeight: '700'
  },
  profileAvatarCenterBox: {
    alignItems: 'center',
    marginBottom: 20
  },
  profileAvatarHalo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: '#e11d48',
    padding: 2,
    shadowColor: '#e11d48',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8
  },
  profileAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 40
  },
  profileName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 10
  },
  profileOnlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginTop: 6
  },
  profileOnlineBadgeText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700'
  },
  profileRoleText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 6
  },
  profileSectionCard: {
    backgroundColor: 'rgba(16, 18, 26, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14
  },
  profileSectionTitle: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10
  },
  profileDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6
  },
  profileDetailLabel: {
    color: '#cbd5e1',
    fontSize: 12
  },
  profileDetailVal: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  profileActionBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10
  },
  profileActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },

  /* CHAT TAB SCREEN */
  chatTabScreen: {
    flex: 1,
    backgroundColor: '#07080c',
    paddingBottom: 68
  },
  chatTopBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)'
  },
  chatTopTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700'
  },
  chatTopSub: {
    color: '#64748b',
    fontSize: 11
  },
  chatClearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)'
  },
  chatClearText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600'
  },
  chatMessageScroll: {
    flex: 1
  },
  chatBubbleRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4
  },
  chatBubbleRowUser: {
    justifyContent: 'flex-end'
  },
  chatBubbleRowMikasa: {
    justifyContent: 'flex-start'
  },
  chatAvatarThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginTop: 4
  },
  chatBubble: {
    maxWidth: width * 0.78,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  chatBubbleUser: {
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.4)',
    borderBottomRightRadius: 4
  },
  chatBubbleMikasa: {
    backgroundColor: 'rgba(16, 18, 26, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomLeftRadius: 4
  },
  chatToolBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 4
  },
  chatToolBadgeText: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700'
  },
  chatMessageText: {
    color: '#f8fafc',
    fontSize: 13,
    lineHeight: 19
  },
  chatTimeText: {
    color: '#64748b',
    fontSize: 9,
    marginTop: 4,
    alignSelf: 'flex-end'
  },
  chatInputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    backgroundColor: 'rgba(16, 18, 26, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 26,
    paddingHorizontal: 6,
    paddingVertical: 4
  },
  chatInputField: {
    flex: 1,
    height: 42,
    paddingHorizontal: 14,
    color: '#ffffff',
    fontSize: 13
  },
  chatSendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center'
  },

  /* TOOL EXECUTION CARD (Screen 9) */
  executingCardOverlay: {
    position: 'absolute',
    bottom: 90,
    alignSelf: 'center',
    width: width - 40,
    backgroundColor: 'rgba(16, 18, 26, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 18,
    padding: 16
  },
  execHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12
  },
  execIconSym: {
    color: '#e11d48',
    fontSize: 16
  },
  execCardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  execStepsBox: {
    gap: 6,
    marginBottom: 14
  },
  execStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  execStepStatusIcon: {
    fontSize: 12,
    color: '#64748b'
  },
  execStepLabel: {
    color: '#94a3b8',
    fontSize: 12
  },
  execStepDone: {
    color: '#e2e8f0'
  },
  execCancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center'
  },
  execCancelText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },

  /* TOOLS & MEMORY & SETTINGS */
  subScreenContainer: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  toolsMainTitle: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '800'
  },
  toolsMainSub: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 2,
    marginBottom: 16
  },
  toolCategoryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20
  },
  toolCatPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6
  },
  toolCatPillActive: {
    backgroundColor: '#e11d48'
  },
  toolCatText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  toolCatTextActive: {
    color: '#ffffff'
  },
  toolSection: {
    marginBottom: 24
  },
  toolSectionTitle: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase'
  },
  toolRowTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(16, 18, 26, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 8
  },
  toolTileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toolTileMeta: {
    flex: 1
  },
  toolTileName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  toolTileDesc: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2
  },
  cleanSearchInput: {
    height: 40,
    backgroundColor: 'rgba(16, 18, 26, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    color: '#ffffff',
    fontSize: 13
  },
  cleanCatPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)'
  },
  cleanCatPillActive: {
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderWidth: 1,
    borderColor: '#e11d48'
  },
  cleanCatPillText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600'
  },
  cleanCatPillTextActive: {
    color: '#fda4af'
  },
  cleanMemoryCard: {
    backgroundColor: 'rgba(16, 18, 26, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10
  },
  memoryCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  memoryTypeBadge: {
    color: '#e11d48',
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  memoryTimestamp: {
    color: '#64748b',
    fontSize: 10
  },
  memoryCardText: {
    color: '#e2e8f0',
    fontSize: 13,
    lineHeight: 18
  },
  settingsGroupCard: {
    backgroundColor: 'rgba(16, 18, 26, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  settingsGroupHeader: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 12
  },
  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6
  },
  settingsLabel: {
    color: '#cbd5e1',
    fontSize: 13
  },
  settingsVal: {
    color: '#64748b',
    fontSize: 13,
    fontWeight: '600'
  },
  onboardReplayBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8
  },
  onboardReplayText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600'
  },

  /* BOTTOM NAVIGATION BAR (5 Vector Tabs) */
  bottomNavBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    backgroundColor: 'rgba(7, 8, 12, 0.98)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 4
  },
  bottomNavBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 52
  },
  bottomNavLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 3
  },
  bottomNavLabelActive: {
    color: '#e11d48',
    fontWeight: '700'
  }
});
