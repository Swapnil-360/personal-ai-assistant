import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  Animated,
  Easing,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  Alert,
  Modal,
  Switch,
  LogBox,
  Linking
} from 'react-native';

// Suppress transient Expo CLI HMR connection warnings from blocking the screen
LogBox.ignoreLogs([
  'Cannot connect to Expo CLI',
  'Possible Unhandled Promise Rejection'
]);
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { CameraView, Camera } from 'expo-camera';
import * as Location from 'expo-location';
import {
  useAudioRecorder,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  createAudioPlayer
} from 'expo-audio';
import { File as ExpoFile } from 'expo-file-system';

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
    const isVoiceProcess = endpoint.includes('/voice') || endpoint.includes('/process');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), isVoiceProcess ? 25000 : 3500);
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
type NavTab = 'home' | 'chat' | 'actions' | 'memory' | 'profile';

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
  imageAttachment?: string;
  fileAttachment?: {
    name: string;
    size?: number;
    mimeType?: string;
  };
}

interface PendingAttachment {
  type: 'image' | 'file';
  name: string;
  uri: string;
  mimeType: string;
  base64?: string;
  textContent?: string;
  size?: number;
}

interface ActionLogItem {
  id: string;
  title: string;
  source: string;
  status: 'SUCCESS' | 'RUNNING' | 'PENDING';
  timestamp: string;
}

// Regex to strictly strip all cartoon emojis per Commander's explicit instruction
const stripEmojis = (str: string) => {
  return str.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F018}-\u{1F0F5}\u{1F200}-\u{1F270}\u{1F9A0}-\u{1F9FF}]/gu,
    ''
  ).trim();
};

/* ========================================================
   SVG ICONS (Exact Match to Image-1 Main Navigation)
   ======================================================== */

// 1. Home Icon (Clean outlined house)
const HomeIcon = ({ active }: { active: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 9.5L12 3L21 9.5V20C21 20.5523 20.5523 21 20 21H15V15H9V21H4C3.44772 21 3 20.5523 3 20V9.5Z"
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// 2. Chat Icon (Speech bubble outline)
const ChatIcon = ({ active }: { active: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M21 11.5C21.0034 12.8199 20.6951 14.1219 20.1 15.3C19.3944 16.7118 18.3098 17.8992 16.9674 18.7293C15.6251 19.5594 14.0782 19.9994 12.5 20C11.1801 20.0034 9.87812 19.6951 8.7 19.1L3 21L4.9 15.3C4.30493 14.1219 3.99656 12.8199 4 11.5C4.00061 9.92179 4.44061 8.37488 5.27072 7.03258C6.10083 5.69028 7.28825 4.6056 8.7 3.9C9.87812 3.30493 11.1801 2.99656 12.5 3H13C15.0843 3.115 17.053 3.99479 18.5291 5.47089C20.0052 6.94699 20.885 8.91568 21 11V11.5Z"
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// 3. Actions Icon (Two connected workflow nodes matching Image-1)
const ActionsIcon = ({ active }: { active: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Rect
      x={4}
      y={4}
      width={7}
      height={7}
      rx={2}
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={1.8}
    />
    <Rect
      x={13}
      y={13}
      width={7}
      height={7}
      rx={2}
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={1.8}
    />
    <Path
      d="M7.5 11V16.5H13"
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// 4. Memory Icon (Anatomical brain outline matching Image-1)
const MemoryIcon = ({ active }: { active: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Path
      d="M9.5 4C8.5 4 7.6 4.4 7 5.1C6.4 4.4 5.5 4 4.5 4C2.6 4 1 5.6 1 7.5C1 8.3 1.3 9.1 1.8 9.7C1.3 10.4 1 11.2 1 12.1C1 13 1.3 13.8 1.8 14.5C1.3 15.1 1 15.9 1 16.8C1 18.7 2.6 20.3 4.5 20.3C5.3 20.3 6.1 20 6.7 19.5C7.3 20.3 8.3 20.8 9.5 20.8C10.6 20.8 11.5 20.3 12 19.6M14.5 4C15.5 4 16.4 4.4 17 5.1C17.6 4.4 18.5 4 19.5 4C21.4 4 23 5.6 23 7.5C23 8.3 22.7 9.1 22.2 9.7C22.7 10.4 23 11.2 23 12.1C23 13 22.7 13.8 22.2 14.5C22.7 15.1 23 15.9 23 16.8C23 18.7 21.4 20.3 19.5 20.3C18.7 20.3 17.9 20 17.3 19.5C16.7 20.3 15.7 20.8 14.5 20.8C13.4 20.8 12.5 20.3 12 19.6M12 4.5V19.5"
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// 5. Profile Icon (User outline matching Image-1)
const ProfileIcon = ({ active }: { active: boolean }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
    <Circle
      cx={12}
      cy={8}
      r={4}
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={1.8}
    />
    <Path
      d="M4.5 20C4.5 16.5 7.5 14.5 12 14.5C16.5 14.5 19.5 16.5 19.5 20"
      stroke={active ? '#e11d48' : '#94a3b8'}
      strokeWidth={1.8}
      strokeLinecap="round"
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

  // Agent Profile Modal & Sitrep Notification Modal
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [sitrepModalVisible, setSitrepModalVisible] = useState(false);

  // Navigation (Image-1: 5 primary tabs): 'home' | 'chat' | 'actions' | 'memory' | 'profile'
  const [navTab, setNavTab] = useState<NavTab>('home');

  // Assistant State for Voice HUD (Home)
  const [assistantState, setAssistantState] = useState<AssistantState>('IDLE');
  const [statusText, setStatusText] = useState('Ready');
  const [subStatusText, setSubStatusText] = useState('"How can I help you, Commander?"');

  // Greeting based on current time
  const [greeting, setGreeting] = useState('Good evening, Commander Swapnil');

  // Dedicated Chat Stream State (Chat Tab)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'mikasa',
      text: 'Good day, Commander Swapnil. I am online and standing by. CurricuRAG research and your workstation bridge are synchronized. How can I assist you?',
      timestamp: 'Online'
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatSearch, setChatSearch] = useState('');
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const chatScrollRef = useRef<ScrollView>(null);

  // Tool Execution Card Overlay
  const [isExecuting, setIsExecuting] = useState(false);
  const [executingTitle, setExecutingTitle] = useState('Executing Action...');
  const [execSteps, setExecSteps] = useState<ToolExecutionStep[]>([]);

  // Hardware Status
  const [pcOnline, setPcOnline] = useState(true);
  const [batteryLevel, setBatteryLevel] = useState(98);
  const [isFlashlightOn, setIsFlashlightOn] = useState(false);

  // Actions Center States
  const [actionCategory, setActionCategory] = useState<'All' | 'Device' | 'Agenda' | 'Workflows' | 'Schedules' | 'Approvals'>('All');
  const [pendingApprovals, setPendingApprovals] = useState([
    {
      id: 'appr-1',
      title: 'Deploy Stark-OS Portfolio',
      desc: 'Push latest commit 5f54fae to Vercel production edge',
      target: 'mrswapnil.me',
      risk: 'Medium'
    }
  ]);
  const [actionLogs, setActionLogs] = useState<ActionLogItem[]>([
    { id: '1', title: 'Workstation volume sync', source: 'Mobile LAN', status: 'SUCCESS', timestamp: '2m ago' },
    { id: '2', title: 'CurricuRAG memory extract', source: 'Supabase DB', status: 'SUCCESS', timestamp: '14m ago' },
    { id: '3', title: 'PC Bridge heartbeat ping', source: 'Swapnil-PC', status: 'SUCCESS', timestamp: '28m ago' }
  ]);

  // Memory Vault State
  const [memories, setMemories] = useState<MemoryItem[]>([
    { id: '1', memory_type: 'fact', content: 'Primary Research: CurricuRAG paper with supervisor Shrabani Das.' },
    { id: '2', memory_type: 'fact', content: 'Edu51Portal provides centralized academic resources for BUBT CSE 51st intake.' },
    { id: '3', memory_type: 'preference', content: 'Prefers strict professional responses with no cartoon emojis.' },
    { id: '4', memory_type: 'decision', content: 'Switched to Gemini 3.5 Flash Lite as primary neural model for sub-second responses.' },
    { id: '5', memory_type: 'workflow', content: 'Telegram bot @mikasa_360_bot acts as 24/7 autonomous mobile companion.' }
  ]);
  const [memFilter, setMemFilter] = useState<'All' | 'fact' | 'preference' | 'workflow' | 'decision'>('All');
  const [memSearch, setMemSearch] = useState('');
  const [isAddMemoryModal, setIsAddMemoryModal] = useState(false);
  const [newMemContent, setNewMemContent] = useState('');
  const [newMemType, setNewMemType] = useState('fact');

  // Today's Agenda on Home
  const [agendaList, setAgendaList] = useState([
    { id: '1', time: '10:00 AM', title: 'CurricuRAG Experiments', desc: 'Review supervisor comments from Shrabani Das' },
    { id: '2', time: '02:30 PM', title: 'Edu51Portal Sync', desc: 'Push latest syllabus notes for CSE 51st Intake' },
    { id: '3', time: '06:00 PM', title: 'Stark-OS Portfolio Radar', desc: 'Check commit diff and automated Vercel preview' }
  ]);

  // Active Tasks on Home
  const [activeTasks, setActiveTasks] = useState([
    { id: '1', title: 'CurricuRAG supervisor acknowledgment', done: true },
    { id: '2', title: 'Local PC Bridge heartbeat sync', done: true },
    { id: '3', title: 'Run n8n automated social media radar', done: false }
  ]);

  // Settings / Profile states
  const [speechRate, setSpeechRate] = useState(1.0);
  const [isProactiveEnabled, setIsProactiveEnabled] = useState(true);
  const [hudWaveformEnabled, setHudWaveformEnabled] = useState(true);

  // Animations
  const pulseOuter = useRef(new Animated.Value(1)).current;
  const pulseInner = useRef(new Animated.Value(1)).current;
  const orbitalSpin = useRef(new Animated.Value(0)).current;
  const pulseOrbital = useRef(new Animated.Value(1)).current;
  const splashLoadBar = useRef(new Animated.Value(0)).current; // 0→1 loading bar

  // Symmetrical Waveform Bars (11 bars)
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

  // Tier 1 & 2: Permission System & Wake Word Engine States
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean | null>(null);
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState<boolean | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState<boolean | null>(null);
  const [isWakeWordEnabled, setIsWakeWordEnabled] = useState(false);
  const [isWakeWordListening, setIsWakeWordListening] = useState(false);

  const listeningTimerRef = useRef<any>(null);
  const activeAudioPlayerRef = useRef<any>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const isRecordingAudioRef = useRef(false);

  // Initialize Audio & Query Hardware Permissions on App Start
  useEffect(() => {
    async function initAudioAndPermissions() {
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true
        });
      } catch (e) {}

      // Refresh permission statuses
      try {
        const mic = await getRecordingPermissionsAsync();
        setMicPermissionGranted(mic.granted);
      } catch (e) {
        try {
          const mic = await Camera.getMicrophonePermissionsAsync();
          setMicPermissionGranted(mic.granted);
        } catch (e2) {
          setMicPermissionGranted(false);
        }
      }

      try {
        const cam = await Camera.getCameraPermissionsAsync();
        setCameraPermissionGranted(cam.granted);
      } catch (e) {
        setCameraPermissionGranted(false);
      }

      try {
        const loc = await Location.getForegroundPermissionsAsync();
        setLocationPermissionGranted(loc.granted);
      } catch (e) {
        setLocationPermissionGranted(false);
      }
    }
    initAudioAndPermissions();

    return () => {
      if (activeAudioPlayerRef.current) {
        try {
          activeAudioPlayerRef.current.pause();
          if (typeof activeAudioPlayerRef.current.remove === 'function') {
            activeAudioPlayerRef.current.remove();
          }
        } catch (e) {}
      }
    };
  }, []);

  // Permission Request Helpers
  const requestMicPermission = async (): Promise<boolean> => {
    try {
      const res = await requestRecordingPermissionsAsync();
      setMicPermissionGranted(res.granted);
      return res.granted;
    } catch (e) {
      try {
        const res = await Camera.requestMicrophonePermissionsAsync();
        setMicPermissionGranted(res.granted);
        return res.granted;
      } catch (e2) {
        return false;
      }
    }
  };

  const requestCameraPermission = async (): Promise<boolean> => {
    try {
      const res = await Camera.requestCameraPermissionsAsync();
      setCameraPermissionGranted(res.granted);
      return res.granted;
    } catch (e) {
      return false;
    }
  };

  const requestLocationPermission = async (): Promise<boolean> => {
    try {
      const res = await Location.requestForegroundPermissionsAsync();
      setLocationPermissionGranted(res.granted);
      return res.granted;
    } catch (e) {
      return false;
    }
  };

  // Wake Word Engine: Toggle Switch Handler with Permission Handshake
  const handleToggleWakeWord = async (value: boolean) => {
    if (value) {
      // Must check/request microphone permission first
      let granted = micPermissionGranted;
      if (!granted) {
        granted = await requestMicPermission();
      }

      if (!granted) {
        Alert.alert(
          'Microphone Access Required',
          'Mikasa requires microphone permission to listen for the "Hey, Mikasa" wake word hands-free.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Grant Access',
              onPress: async () => {
                const nowGranted = await requestMicPermission();
                if (nowGranted) {
                  setIsWakeWordEnabled(true);
                  setIsWakeWordListening(true);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  speakAsMikasa('Wake word activated. Listening for Hey Mikasa.');
                }
              }
            }
          ]
        );
        setIsWakeWordEnabled(false);
        setIsWakeWordListening(false);
        return;
      }

      setIsWakeWordEnabled(true);
      setIsWakeWordListening(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      speakAsMikasa('Wake word activated. Standing by for Hey Mikasa, Commander.');
    } else {
      setIsWakeWordEnabled(false);
      setIsWakeWordListening(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      speakAsMikasa('Wake word deactivated.');
    }
  };

  // 1. Initial Setup: Splash Loading Sequence -> Onboarding
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning, Commander Swapnil');
    else if (hour < 18) setGreeting('Good afternoon, Commander Swapnil');
    else setGreeting('Good evening, Commander Swapnil');

    // Animate the splash loading bar over 2.2 seconds
    Animated.timing(splashLoadBar, {
      toValue: 1,
      duration: 2200,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false
    }).start();

    const splashTimer = setTimeout(() => {
      setAppFlow('onboarding');
    }, 2400);

    pollWorkstation();
    const interval = setInterval(pollWorkstation, 12000);

    return () => {
      clearTimeout(splashTimer);
      clearInterval(interval);
    };
  }, []);

  // 2. Concentric Ring Pulsing
  useEffect(() => {
    const pulseAnim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseOuter, {
            toValue: 1.15,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseInner, {
            toValue: 1.08,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ]),
        Animated.parallel([
          Animated.timing(pulseOuter, {
            toValue: 1,
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
      ])
    );
    pulseAnim.start();
    return () => pulseAnim.stop();
  }, []);

  // 3. Audio Waveform & Orbital Animations
  useEffect(() => {
    let spinLoop: Animated.CompositeAnimation | null = null;
    let orbitalPulseLoop: Animated.CompositeAnimation | null = null;
    const waveLoops: Animated.CompositeAnimation[] = [];

    if (assistantState === 'LISTENING') {
      spinLoop = Animated.loop(
        Animated.timing(orbitalSpin, {
          toValue: 1,
          duration: 3200,
          easing: Easing.linear,
          useNativeDriver: true
        })
      );
      spinLoop.start();

      orbitalPulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseOrbital, {
            toValue: 1.12,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseOrbital, {
            toValue: 0.98,
            duration: 750,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      );
      orbitalPulseLoop.start();

      const targets = [
        [6, 18],
        [12, 32],
        [20, 50],
        [34, 70],
        [52, 92],
        [68, 105],
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

  // 4. Workstation Status Polling
  const pollWorkstation = async () => {
    try {
      const res = await commanderFetch('/api/pc/status');
      if (res.ok) setPcOnline(true);
      else setPcOnline(false);
    } catch (e) {
      setPcOnline(false);
    }
  };

  // 5. Speak naturally with Gemini Cute Kore voice or Expo Speech fallback
  const speakAsMikasa = async (textToSpeak: string, onFinish?: () => void) => {
    const cleanText = stripEmojis(textToSpeak);
    if (!cleanText) {
      setAssistantState('IDLE');
      setStatusText('Ready');
      if (onFinish) onFinish();
      return;
    }

    setAssistantState('SPEAKING');
    setStatusText('Speaking...');

    // Stop and unload existing sound if playing
    if (activeAudioPlayerRef.current) {
      try {
        activeAudioPlayerRef.current.pause();
        if (typeof activeAudioPlayerRef.current.remove === 'function') {
          activeAudioPlayerRef.current.remove();
        }
      } catch (e) {}
      activeAudioPlayerRef.current = null;
    }

    // Try Gemini Server TTS (Cute Kore Voice) over LAN via createAudioPlayer if available
    if (typeof createAudioPlayer === 'function') {
      try {
        const ttsUri = `${LAN_API_BASE}/api/voice/tts?text=${encodeURIComponent(cleanText.slice(0, 300))}`;
        const player = createAudioPlayer(ttsUri);
        activeAudioPlayerRef.current = player;
        player.play();

        player.addListener('playbackStatusUpdate', (status: any) => {
          if (status?.didJustFinish) {
            setAssistantState('IDLE');
            setStatusText('Ready');
            activeAudioPlayerRef.current = null;
            if (onFinish) onFinish();
          }
        });
        return;
      } catch (ttsErr) {}
    }

    // Native Speech Fallback - reliable on all devices
    try {
      Speech.stop();
      setTimeout(() => {
        Speech.speak(cleanText, {
          rate: speechRate || 1.0,
          pitch: 1.0,
          onDone: () => {
            setAssistantState('IDLE');
            setStatusText('Ready');
            if (onFinish) onFinish();
          },
          onError: () => {
            setAssistantState('IDLE');
            setStatusText('Ready');
            if (onFinish) onFinish();
          }
        });
      }, 60);
    } catch (e) {
      setAssistantState('IDLE');
      setStatusText('Ready');
      if (onFinish) onFinish();
    }
  };

  // 6. "About Mikasa" Audio Trigger (Plays her authentic recorded voice intro with fallback)
  const playAboutMeAudio = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    setAssistantState('SPEAKING');
    setStatusText('Speaking...');
    setSubStatusText('"I am Mikasa, Commander Swapnil\'s Autonomous AI Companion"');

    // Unload previous sound if any
    if (activeAudioPlayerRef.current) {
      try {
        activeAudioPlayerRef.current.pause();
        if (typeof activeAudioPlayerRef.current.remove === 'function') {
          activeAudioPlayerRef.current.remove();
        }
      } catch (e) {}
      activeAudioPlayerRef.current = null;
    }

    // Try authentic audio file via createAudioPlayer
    if (typeof createAudioPlayer === 'function') {
      try {
        const audioUri = `${LAN_API_BASE}/audio/who_is_mikasa.mp3`;
        const player = createAudioPlayer(audioUri);
        activeAudioPlayerRef.current = player;
        player.play();
        player.addListener('playbackStatusUpdate', (status: any) => {
          if (status?.didJustFinish) {
            setAssistantState('IDLE');
            setStatusText('Ready');
            activeAudioPlayerRef.current = null;
          }
        });
        return;
      } catch (soundErr) {}
    }

    const introSpeech =
      'I am Mikasa, an autonomous AI companion created exclusively for Commander Swapnil. Built with neural reasoning and proactive monitoring, I coordinate your digital workspace, manage your memories, and safeguard your workflow. Smart, loyal, and always by your side.';
    speakAsMikasa(introSpeech);
  };

  // 7. Voice: Stop & Process using expo-audio recorder
  const stopAndProcessVoice = async () => {
    if (listeningTimerRef.current) {
      clearTimeout(listeningTimerRef.current);
      listeningTimerRef.current = null;
    }
    if (!isRecordingAudioRef.current) return;
    isRecordingAudioRef.current = false;

    setAssistantState('THINKING');
    setStatusText('Transcribing...');
    setSubStatusText('Analyzing your voice with Gemini...');

    let audioUri: string | null = null;
    try {
      await audioRecorder.stop();
      audioUri = audioRecorder.uri || null;
    } catch (stopErr: any) {
      console.warn('[Recording Stop Error]:', stopErr?.message || stopErr);
    }

    // Reset audio mode for TTS playback
    try {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch (e) {}

    if (!audioUri) {
      setAssistantState('IDLE');
      setStatusText('Ready');
      setSubStatusText('"No audio detected — tap to try again"');
      return;
    }

    let base64Audio = '';
    // Method 1: Expo SDK 57 File class base64
    try {
      const fileObj = new ExpoFile(audioUri);
      if (typeof (fileObj as any).base64 === 'function') {
        base64Audio = await (fileObj as any).base64();
      } else if (typeof (fileObj as any).base64Sync === 'function') {
        base64Audio = (fileObj as any).base64Sync();
      }
    } catch (fsErr: any) {
      console.warn('[ExpoFile Base64 Error]:', fsErr?.message || fsErr);
    }

    // Method 2: Fetch Blob + FileReader fallback (failsafe for local file URIs)
    if (!base64Audio) {
      try {
        const resp = await fetch(audioUri);
        const blob = await resp.blob();
        base64Audio = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const resultStr = (reader.result as string) || '';
            const b64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
            resolve(b64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (blobErr: any) {
        console.warn('[Blob Base64 Error]:', blobErr?.message || blobErr);
      }
    }

    if (!base64Audio) {
      setAssistantState('IDLE');
      setStatusText('Ready');
      setSubStatusText('"Could not encode audio"');
      return;
    }

    try {
      const res = await commanderFetch('/api/voice/process', {
        method: 'POST',
        body: JSON.stringify({
          audio_base64: base64Audio,
          mime_type: 'audio/mp4',
          conversation_id: 'commander_session'
        })
      });

      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();
      const transcribedQuery = (data.transcription || '').trim();
      const rawReply = (data.reply || '').trim();

      if (!transcribedQuery) {
        setAssistantState('IDLE');
        setStatusText('Ready');
        setSubStatusText('"Silence detected. Tap mic to try again."');
        speakAsMikasa('I could not hear you, Commander. Please try again.');
        return;
      }

      const userMsg: ChatMessage = {
        id: Date.now().toString(), sender: 'user', text: transcribedQuery,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setChatMessages(prev => [...prev, userMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);

      setActionLogs(prev => [{
        id: Date.now().toString(), title: `Voice: "${transcribedQuery.slice(0, 30)}"`,
        source: 'Voice HUD', status: 'SUCCESS', timestamp: 'Just now'
      }, ...prev.slice(0, 9)]);

      // Handle alarm/reminder phone actions from server
      const phoneActions: any[] = data.phone_actions || [];
      for (const pa of phoneActions) {
        if (pa.type === 'SET_ALARM' || pa.type === 'alarm_set') {
          const t = pa.time ? new Date(pa.time) : null;
          Alert.alert('Alarm Set', `"${pa.label || transcribedQuery}" at ${t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Scheduled'}`, [{ text: 'OK' }]);
        }
        if (pa.type === 'SET_CALENDAR_EVENT' && pa.gcal_url) {
          Alert.alert('Add to Calendar', `Open Google Calendar for: "${pa.title || transcribedQuery}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Calendar', onPress: () => Linking.openURL(pa.gcal_url) }
          ]);
        }
      }

      const cleanReply = stripEmojis(rawReply || 'Acknowledged, Commander.');
      const mikasaMsg: ChatMessage = {
        id: (Date.now() + 1).toString(), sender: 'mikasa', text: cleanReply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        toolUsed: data.action || 'Gemini AI Brain'
      };
      setChatMessages(prev => [...prev, mikasaMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 150);

      setAssistantState('SPEAKING');
      setStatusText('Speaking...');
      setSubStatusText(cleanReply.length > 55 ? `"${cleanReply.slice(0, 52)}..."` : `"${cleanReply}"`);
      speakAsMikasa(cleanReply, () => {
        setAssistantState('IDLE');
        setStatusText('Ready');
        setSubStatusText('"How can I help you, Commander?"');
      });
    } catch (apiErr: any) {
      console.warn('[Voice API Error]:', apiErr?.message || apiErr);
      setAssistantState('IDLE');
      setStatusText('Ready');
      setSubStatusText('"Voice processing failed"');
      Alert.alert('Voice Failed', 'Could not reach Mikasa server. Check Wi-Fi connection.');
    }
  };

  const handleMicTap = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}

    // If Mikasa is speaking, tapping interrupts and silences her
    if (assistantState === 'SPEAKING') {
      if (activeAudioPlayerRef.current) {
        try {
          activeAudioPlayerRef.current.pause();
        } catch (e) {}
      }
      Speech.stop();
      setAssistantState('IDLE');
      setStatusText('Ready');
      setSubStatusText('"How can I help you, Commander?"');
      return;
    }

    // If already recording/listening, tapping again means user is done speaking: stop and process immediately!
    if (assistantState === 'LISTENING' || isRecordingAudioRef.current) {
      await stopAndProcessVoice();
      return;
    }

    // Otherwise, check microphone permission
    let granted = micPermissionGranted;
    if (!granted) {
      granted = await requestMicPermission();
    }
    if (!granted) {
      Alert.alert(
        'Microphone Access Required',
        'Mikasa needs microphone permission to listen to your voice commands.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Grant Access', onPress: () => requestMicPermission() }
        ]
      );
      return;
    }

    if (activeAudioPlayerRef.current) {
      try {
        activeAudioPlayerRef.current.pause();
      } catch (e) {}
    }
    Speech.stop();

    try {
      // Set audio mode for recording
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      isRecordingAudioRef.current = true;

      setAssistantState('LISTENING');
      setStatusText('Listening...');
      setSubStatusText('"Listening... Tap mic again when finished"');

      // Auto-stop after 10 seconds
      if (listeningTimerRef.current) clearTimeout(listeningTimerRef.current);
      listeningTimerRef.current = setTimeout(() => { stopAndProcessVoice(); }, 10000);
    } catch (recordErr: any) {
      console.warn('[Audio Record Start Error]:', recordErr?.message || recordErr);
      setAssistantState('IDLE');
      setStatusText('Ready');
      setSubStatusText('"Microphone error — check permissions"');
      Alert.alert('Recording Error', 'Could not start microphone: ' + (recordErr?.message || 'Unknown error. Try restarting the app.'));
    }
  };

  // Image & Document Pickers for Multimodal AI Chat
  const handlePickImage = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    Alert.alert(
      'Attach Image',
      'Choose image source for Mikasa to analyze:',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Camera permission is required to capture photos.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              base64: true,
              quality: 0.7
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              const asset = result.assets[0];
              setPendingAttachment({
                type: 'image',
                name: asset.fileName || `photo_${Date.now()}.jpg`,
                uri: asset.uri,
                mimeType: asset.mimeType || 'image/jpeg',
                base64: asset.base64 || undefined
              });
            }
          }
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
              Alert.alert('Permission Denied', 'Media library permission is required to select photos.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              base64: true,
              quality: 0.7
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
              const asset = result.assets[0];
              setPendingAttachment({
                type: 'image',
                name: asset.fileName || `image_${Date.now()}.jpg`,
                uri: asset.uri,
                mimeType: asset.mimeType || 'image/jpeg',
                base64: asset.base64 || undefined
              });
            }
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handlePickDocument = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e) {}

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        let base64: string | undefined;
        let textContent: string | undefined;

        try {
          const fileObj = new ExpoFile(asset.uri);
          base64 = await fileObj.base64();
        } catch (e) {
          try {
            const resp = await fetch(asset.uri);
            const blob = await resp.blob();
            base64 = await new Promise((res, rej) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const b64 = (reader.result as string).split(',')[1];
                res(b64);
              };
              reader.onerror = rej;
              reader.readAsDataURL(blob);
            });
          } catch (e2) {}
        }

        const isText = (asset.mimeType && (asset.mimeType.startsWith('text/') || asset.mimeType.includes('json') || asset.mimeType.includes('javascript') || asset.mimeType.includes('xml'))) ||
                       /\.(txt|md|js|ts|tsx|jsx|json|py|html|css|csv|log|sh|bat)$/i.test(asset.name);

        if (isText && base64) {
          try {
            textContent = atob(base64);
          } catch (e) {}
        }

        setPendingAttachment({
          type: 'file',
          name: asset.name,
          uri: asset.uri,
          mimeType: asset.mimeType || 'application/octet-stream',
          size: asset.size,
          base64,
          textContent
        });
      }
    } catch (err: any) {
      console.warn('[Document Picker Error]:', err?.message || err);
      Alert.alert('File Selection Failed', 'Could not access the selected file.');
    }
  };

  // 8. Core Command Execution (Used by Voice & Chat - talks like Telegram)
  const executeCommand = async (rawQuery: string, source: 'voice' | 'chat' = 'chat', attachmentToSend?: PendingAttachment | null) => {
    const currentAttachment = attachmentToSend !== undefined ? attachmentToSend : pendingAttachment;
    let query = stripEmojis(rawQuery.trim());
    if (!query && !currentAttachment) return;

    if (!query && currentAttachment) {
      query = currentAttachment.type === 'image'
        ? 'Please analyze this attached image and explain what you see, Mikasa.'
        : `Please review and explain this document (${currentAttachment.name}), Mikasa.`;
    }

    if (source === 'chat') {
      setChatInput('');
      setPendingAttachment(null);
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}

    // Append to Chat Tab Stream
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imageAttachment: currentAttachment?.type === 'image' ? currentAttachment.uri : undefined,
      fileAttachment: currentAttachment?.type === 'file' ? {
        name: currentAttachment.name,
        size: currentAttachment.size,
        mimeType: currentAttachment.mimeType
      } : undefined
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
    setSubStatusText(currentAttachment ? 'Analyzing attachment with Gemini...' : 'Reasoning with Gemini...');

    // Device command execution card
    if (query.toLowerCase().includes('call') || query.toLowerCase().includes('rahim') || query.toLowerCase().includes('lock')) {
      setIsExecuting(true);
      setExecutingTitle(query.toLowerCase().includes('lock') ? 'Locking Workstation...' : 'Calling Contact...');
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
          conversation_id: 'commander_session',
          attachment: currentAttachment ? {
            type: currentAttachment.type,
            name: currentAttachment.name,
            mime_type: currentAttachment.mimeType,
            base64: currentAttachment.base64,
            text_content: currentAttachment.textContent
          } : undefined
        })
      });

      const data = await res.json();
      const rawReply = data.reply || data.reply_text || data.transcription || 'Acknowledged, Commander.';
      const cleanReply = stripEmojis(rawReply);
      const toolUsed = data.action || (data.tools_used && data.tools_used.length > 0 ? data.tools_used[0].tool : undefined);

      // Handle phone actions from server (SET_ALARM, SET_CALENDAR_EVENT, etc.)
      const phoneActions: any[] = data.phone_actions || [];
      for (const pa of phoneActions) {
        if (pa.type === 'SET_ALARM' || pa.type === 'alarm_set') {
          const t = pa.time ? new Date(pa.time) : null;
          Alert.alert(
            'Alarm Locked In',
            `"${pa.label || query}" — ${t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Scheduled'}`,
            [{ text: 'OK' }]
          );
        }
        if (pa.type === 'SET_CALENDAR_EVENT' && pa.gcal_url) {
          Alert.alert(
            'Add to Calendar',
            `Open Google Calendar for: "${pa.title || query}"?`,
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Calendar', onPress: () => Linking.openURL(pa.gcal_url) }
            ]
          );
        }
      }

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

      // Add to Action History Log
      setActionLogs(prev => [
        {
          id: Date.now().toString(),
          title: `Command: "${query.slice(0, 30)}"`,
          source: source === 'voice' ? 'Voice HUD' : 'Chat Workspace',
          status: 'SUCCESS',
          timestamp: 'Just now'
        },
        ...prev.slice(0, 9)
      ]);

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

  // 9. Workstation & Device Actions (The 13 Mobile App Controls)
  const triggerDeviceAction = async (action: 'lock' | 'mute' | 'screen' | 'vol_up' | 'vol_down' | 'torch') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}

    if (action === 'torch') {
      let granted = cameraPermissionGranted;
      if (!granted) {
        granted = await requestCameraPermission();
      }
      if (!granted) {
        Alert.alert(
          'Flashlight Permission Required',
          'Camera access is required on Android to toggle the physical hardware flashlight.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Grant Access', onPress: () => requestCameraPermission() }
          ]
        );
        return;
      }
      setIsFlashlightOn(prev => !prev);
      const stateStr = !isFlashlightOn ? 'on' : 'off';
      speakAsMikasa(`Flashlight turned ${stateStr}, Commander.`);
      return;
    }

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

  // 10. Load Memories
  const loadMemories = async () => {
    try {
      let url = `/api/memories?limit=50`;
      if (memFilter !== 'All') url += `&type=${memFilter}`;
      if (memSearch) url += `&search=${encodeURIComponent(memSearch)}`;
      const res = await commanderFetch(url);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) setMemories(data);
    } catch (e) {}
  };

  useEffect(() => {
    if (navTab === 'memory') loadMemories();
  }, [navTab, memFilter, memSearch]);

  // Handle adding new memory
  const handleAddMemory = async () => {
    if (!newMemContent.trim()) return;
    try {
      const res = await commanderFetch('/api/memories', {
        method: 'POST',
        body: JSON.stringify({
          content: newMemContent.trim(),
          memory_type: newMemType
        })
      });
      setNewMemContent('');
      setIsAddMemoryModal(false);
      loadMemories();
      speakAsMikasa('Memory recorded successfully, Commander.');
    } catch (e) {
      setIsAddMemoryModal(false);
    }
  };

  // Handle deleting memory
  const handleDeleteMemory = async (id: string) => {
    try {
      await commanderFetch(`/api/memories/${id}`, { method: 'DELETE' });
      setMemories(prev => prev.filter(m => m.id !== id));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) {}
  };

  // Filtered Chat Messages
  const visibleChatMessages = chatSearch.trim()
    ? chatMessages.filter(m => m.text.toLowerCase().includes(chatSearch.toLowerCase()))
    : chatMessages;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />

        {/* Physical Hardware Flashlight / Torch Controller */}
        {cameraPermissionGranted && CameraView && (
          <CameraView
            style={{ width: 1, height: 1, position: 'absolute', opacity: 0 }}
            enableTorch={isFlashlightOn}
            facing="back"
          />
        )}

        {/* ========================================================
            FLOW 1: SPLASH / LAUNCH SCREEN (Exact Match to Mockup Screen 1)
            Centered Mikasa portrait top, M logo, brand title & centered loading bar
            ======================================================== */}
        {appFlow === 'splash' && (
          <View style={styles.splashScreen}>
            {/* Centered Mikasa portrait occupying upper screen */}
            <View style={styles.splashImgWrapper}>
              <Image
                source={require('./assets/mikasa-portrait.png')}
                style={styles.splashPortraitCentered}
                resizeMode="contain"
              />
            </View>

            {/* Bottom branding + centered loading bar */}
            <View style={styles.splashBottomContent}>
              {/* Stylized Geometric M Mark */}
              <View style={styles.splashMLogo}>
                <Svg width={28} height={28} viewBox="0 0 32 32" fill="none">
                  <Path
                    d="M 6 25 L 6 7 L 16 19 L 26 7 L 26 25"
                    stroke="#e11d48"
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </View>

              <Text style={styles.splashBrandTitle}>M I K A S A</Text>
              <Text style={styles.splashBrandSub}>Your Personal AI Assistant</Text>

              {/* Centered Animated Progress Bar */}
              <View style={styles.splashLoadBarTrack}>
                <Animated.View
                  style={[
                    styles.splashLoadBarFill,
                    { width: splashLoadBar.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }
                  ]}
                />
              </View>
            </View>
          </View>
        )}

        {/* ========================================================
            FLOW 2: ONBOARDING — Exact Match to Mockup Screens 2, 3, 4, 5
            ======================================================== */}
        {appFlow === 'onboarding' && (
          <View style={styles.onboardScreen}>

            {/* ---- SCREEN 2: Onboarding (1/5) - Your personal AI assistant ---- */}
            {onboardingStep === 1 && (
              <View style={styles.ob1Screen}>
                <View style={styles.obTopBar}>
                  <Text style={styles.obBrand}>M I K A S A</Text>
                </View>

                <View style={styles.ob1Body}>
                  {/* Left Column Text */}
                  <View style={styles.ob1TextCol}>
                    <Text style={styles.ob1HeroLine}>
                      Your personal{'\n'}<Text style={styles.obRed}>AI assistant.</Text>
                    </Text>
                    <Text style={styles.ob1Sub}>
                      More than a chatbot.{'\n'}Mikasa lives in your phone,{'\n'}ready to help, anytime.
                    </Text>
                  </View>

                  {/* Right Lower Mikasa Portrait */}
                  <Image
                    source={require('./assets/mikasa-portrait.png')}
                    style={styles.ob1Portrait}
                    resizeMode="contain"
                  />
                </View>
              </View>
            )}

            {/* ---- SCREEN 3: Onboarding (2/5) - Talk naturally ---- */}
            {onboardingStep === 2 && (
              <View style={styles.obSlide}>
                <View style={styles.obTopBar}>
                  <Text style={styles.obBrand}>M I K A S A</Text>
                </View>
                <View style={styles.obSlideContent}>
                  <Text style={styles.obHero}>
                    Talk <Text style={styles.obRed}>naturally.</Text>
                  </Text>
                  <Text style={styles.obSub}>Say what you need.{'\n'}Mikasa handles the rest.</Text>

                  {/* Symmetrical Glowing Audio Waveform */}
                  <View style={styles.obWaveRow}>
                    {[4, 8, 14, 22, 36, 52, 62, 52, 36, 22, 14, 8, 4].map((h, i) => (
                      <View
                        key={i}
                        style={[
                          styles.obWaveBar,
                          { height: h, opacity: 0.75 + (i % 3) * 0.12 }
                        ]}
                      />
                    ))}
                  </View>

                  {/* Voice command bubbles matching mockup */}
                  <View style={styles.obBubblesCol}>
                    {[
                      '"Hey Mikasa, call Mom"',
                      '"Set a reminder for 8 PM"',
                      '"Open Telegram"'
                    ].map((txt, i) => (
                      <View key={i} style={styles.obCmdBubble}>
                        <Text style={styles.obCmdBubbleText}>{txt}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* ---- SCREEN 4: Onboarding (3/5) - Connected to your digital world ---- */}
            {onboardingStep === 3 && (
              <View style={styles.obSlide}>
                <View style={styles.obTopBar}>
                  <Text style={styles.obBrand}>M I K A S A</Text>
                </View>
                <View style={styles.obSlideContent}>
                  <Text style={styles.obHero}>
                    Connected to your{'\n'}<Text style={styles.obRed}>digital world.</Text>
                  </Text>
                  <Text style={styles.obSub}>
                    Your apps, calendar, messages,{'\n'}files and more. All in one place.
                  </Text>

                  {/* 3x2 Squircle Cards Grid matching mockup */}
                  <View style={styles.obAppGrid}>
                    {[
                      { id: 'phone', label: 'Phone', renderIcon: () => <Feather name="phone-call" size={24} color="#38bdf8" /> },
                      { id: 'apps', label: 'Apps', renderIcon: () => <Feather name="grid" size={24} color="#a855f7" /> },
                      { id: 'calendar', label: 'Calendar', renderIcon: () => <Feather name="calendar" size={24} color="#f59e0b" /> },
                      { id: 'messages', label: 'Messages', renderIcon: () => <Feather name="message-square" size={24} color="#10b981" /> },
                      { id: 'telegram', label: 'Telegram', renderIcon: () => <Feather name="send" size={24} color="#38bdf8" /> },
                      { id: 'memory', label: 'Memory', renderIcon: () => <MaterialCommunityIcons name="brain" size={26} color="#e11d48" /> }
                    ].map(app => (
                      <View key={app.label} style={styles.obAppCard}>
                        {app.renderIcon()}
                        <Text style={styles.obAppCardLabel}>{app.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            )}

            {/* ---- SCREEN 5: Onboarding (4/5) - Meet your assistant ---- */}
            {onboardingStep === 4 && (
              <View style={styles.obSlide}>
                <View style={styles.obTopBar}>
                  <Text style={styles.obBrand}>M I K A S A</Text>
                </View>
                <View style={styles.obSlideContent}>
                  <Text style={styles.obHero}>
                    Meet your{'\n'}<Text style={styles.obRed}>assistant.</Text>
                  </Text>
                  <Text style={styles.obSub}>Smart. Loyal. Always with you.</Text>

                  {/* Circular Avatar with Glowing Neon Crimson Ring */}
                  <View style={styles.obAvatarWrapper}>
                    <View style={styles.obAvatarRingOuter} />
                    <View style={styles.obAvatarRingInner} />
                    <Image source={require('./assets/mikasa.jpeg')} style={styles.obAvatarImg} />
                  </View>
                  <Text style={styles.obAvatarName}>Mikasa</Text>
                  <View style={styles.obOnlineRow}>
                    <View style={styles.obOnlineDot} />
                    <Text style={styles.obOnlineText}>Online</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ---- SCREEN 6: Onboarding (5/5) - Ready to begin ---- */}
            {onboardingStep === 5 && (
              <View style={styles.obSlide}>
                <View style={styles.obTopBar}>
                  <Text style={styles.obBrand}>M I K A S A</Text>
                </View>
                <View style={styles.obSlideContent}>
                  <Text style={styles.obHero}>
                    Ready to{'\n'}<Text style={styles.obRed}>begin?</Text>
                  </Text>
                  <Text style={styles.obSub}>
                    Your voice HUD, memory vault, and autonomous workstation are live.
                  </Text>

                  {/* Pulsing Voice Stage Preview */}
                  <View style={styles.obReadyWrapper}>
                    <View style={styles.obReadyPulseOuter} />
                    <View style={styles.obReadyPulseInner}>
                      <Feather name="mic" size={32} color="#ffffff" />
                    </View>
                    <Text style={styles.obReadyNote}>Say "Hey Mikasa" or tap the mic anytime</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Bottom Navigation Bar with 5 Indicator Dots */}
            <View style={styles.onboardBottomBar}>
              <TouchableOpacity onPress={() => onboardingStep > 1 ? setOnboardingStep(s => s - 1) : setAppFlow('main')}>
                <Text style={styles.onboardSkipBtn}>{onboardingStep > 1 ? 'Back' : 'Skip'}</Text>
              </TouchableOpacity>

              <View style={styles.onboardDotsRow}>
                {[1, 2, 3, 4, 5].map(step => (
                  <View
                    key={step}
                    style={[
                      styles.onboardDot,
                      onboardingStep === step && styles.onboardDotActive
                    ]}
                  />
                ))}
              </View>

              {onboardingStep < 5 ? (
                <TouchableOpacity style={styles.onboardNextBtn} onPress={() => setOnboardingStep(s => s + 1)}>
                  <Text style={styles.onboardNextBtnText}>Next →</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.onboardNextBtn} onPress={() => setAppFlow('main')}>
                  <Text style={styles.onboardNextBtnText}>Get Started →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}


        {/* ========================================================
            FLOW 3: MAIN APP (5 Primary Tabs Matching Image-1)
            ======================================================== */}
        {appFlow === 'main' && (
          <View style={{ flex: 1 }}>

            {/* ========================================================
                TAB 1: HOME (CLEAN VOICE ASSISTANT HUD - NO SCROLL CLUTTER)
                Stationary Geometric Stage + Floating Orbital Mic
                ======================================================== */}
            {navTab === 'home' && (
              <View style={styles.homeVoiceScreen}>
                {/* 1. Top Brand Header with Status & Notification Bell */}
                <View style={styles.hudTopHeader}>
                  <View style={styles.hudBrandLeft}>
                    <Text style={styles.hudBrandName}>M I K A S A</Text>
                    <View style={styles.hudStatusDotRow}>
                      <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                      <Text style={styles.statusDotText}>
                        {assistantState === 'LISTENING' ? 'Listening...' : assistantState === 'EXECUTING' ? 'Executing...' : pcOnline ? 'Swapnil-PC Online' : 'Online'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {/* Notification Bell Trigger for Sitrep & Agenda */}
                    <TouchableOpacity
                      style={styles.hudBellBtn}
                      onPress={() => setSitrepModalVisible(true)}
                      activeOpacity={0.7}
                    >
                      <Feather name="bell" size={18} color="#cbd5e1" />
                      <View style={styles.hudBellBadge} />
                    </TouchableOpacity>

                    {/* Profile Trigger Button (Avatar at Top Right) */}
                    <TouchableOpacity onPress={() => setProfileModalVisible(true)} activeOpacity={0.7}>
                      <View style={styles.hudAvatarBorder}>
                        <Image source={require('./assets/mikasa.jpeg')} style={styles.hudAvatarImg} />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 2. Stationary Geometric Center Stage */}
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

                  {/* Status Hierarchy */}
                  <Text style={styles.orbTitleText}>
                    {assistantState === 'LISTENING' ? 'Listening...' : 'Mikasa'}
                  </Text>

                  <View style={styles.orbReadyRow}>
                    <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.orbReadyText}>{statusText}</Text>
                  </View>

                  {/* Undulating Crimson Waveform while listening */}
                  {assistantState === 'LISTENING' ? (
                    <View style={styles.liveAudioWaveformBox}>
                      {waveHeights.map((h, i) => (
                        <Animated.View key={i} style={[styles.liveWaveformBar, { height: h }]} />
                      ))}
                    </View>
                  ) : (
                    <>
                      {/* Red Subtitle Prompt */}
                      <Text style={styles.orbSubtitlePromptRed}>
                        {subStatusText}
                      </Text>

                      {/* "About Mikasa" Audio Button */}
                      <TouchableOpacity
                        style={styles.aboutMeAudioPill}
                        onPress={playAboutMeAudio}
                        activeOpacity={0.75}
                      >
                        <Feather name="headphones" size={14} color="#e11d48" style={{ marginRight: 6 }} />
                        <Text style={styles.aboutMeAudioPillText}>About Mikasa (Listen)</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                {/* 3. Prominent Standalone Floating Mic with Animated Orbital Ring */}
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
                      <Ionicons name="terminal-outline" size={18} color="#e11d48" />
                      <Text style={styles.execCardTitle}>{executingTitle}</Text>
                    </View>
                    <View style={styles.execStepsBox}>
                      {execSteps.map((step, idx) => (
                        <View key={idx} style={styles.execStepItem}>
                          {step.status === 'done' ? (
                            <Feather name="check-circle" size={14} color="#10b981" style={{ marginRight: 8 }} />
                          ) : step.status === 'active' ? (
                            <Ionicons name="radio-button-on" size={14} color="#e11d48" style={{ marginRight: 8 }} />
                          ) : (
                            <Ionicons name="ellipse-outline" size={14} color="#64748b" style={{ marginRight: 8 }} />
                          )}
                          <Text style={[styles.execStepLabel, step.status === 'done' && styles.execStepDone]}>
                            {step.label}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity style={styles.execCancelBtn} onPress={() => setIsExecuting(false)} activeOpacity={0.7}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="x" size={13} color="#f43f5e" style={{ marginRight: 4 }} />
                        <Text style={styles.execCancelText}>Cancel</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ========================================================
                TAB 2: CHAT (FULL WORKSPACE - TALKS LIKE TG @mikasa_360_bot)
                Text + Voice + File Attachments + Image Analysis + Search + Memories
                ======================================================== */}
            {navTab === 'chat' && (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.chatTabScreen}
              >
                {/* Telegram-style Top Header */}
                <View style={styles.tgChatHeader}>
                  <View style={styles.tgAvatarBox}>
                    <Image source={require('./assets/mikasa.jpeg')} style={styles.tgAvatarImg} />
                    <View style={styles.tgOnlineDot} />
                  </View>

                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.tgHeaderName}>Mikasa Ackerman</Text>
                    <Text style={styles.tgHeaderStatus}>online • loyal companion</Text>
                  </View>

                  <TouchableOpacity
                    style={styles.tgSearchIconBtn}
                    onPress={() => setIsChatSearchOpen(v => !v)}
                    activeOpacity={0.7}
                  >
                    <Feather name="search" size={18} color="#cbd5e1" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tgSearchIconBtn, { marginLeft: 8 }]}
                    onPress={() => setChatMessages([])}
                    activeOpacity={0.7}
                  >
                    <Feather name="trash-2" size={17} color="#f43f5e" />
                  </TouchableOpacity>
                </View>

                {/* Conversation Search Bar */}
                {isChatSearchOpen && (
                  <View style={styles.chatSearchInputBox}>
                    <Feather name="search" size={15} color="#64748b" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.chatSearchInput}
                      placeholder="Search conversation..."
                      placeholderTextColor="#64748b"
                      value={chatSearch}
                      onChangeText={setChatSearch}
                      autoFocus
                    />
                    {chatSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setChatSearch('')} activeOpacity={0.7}>
                        <Feather name="x" size={15} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Scrollable Message List */}
                <ScrollView
                  ref={chatScrollRef}
                  style={styles.chatMessageScroll}
                  contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}
                >
                  {visibleChatMessages.map(msg => (
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
                            <Ionicons name="flash" size={11} color="#f59e0b" style={{ marginRight: 4 }} />
                            <Text style={styles.chatToolBadgeText}>Tool: {msg.toolUsed}</Text>
                          </View>
                        )}

                        {/* Image Attachment Preview inside Chat Bubble */}
                        {msg.imageAttachment && (
                          <Image
                            source={{ uri: msg.imageAttachment }}
                            style={styles.chatBubbleImg}
                            resizeMode="cover"
                          />
                        )}

                        {/* File Attachment Preview inside Chat Bubble */}
                        {msg.fileAttachment && (
                          <View style={styles.chatBubbleFileRow}>
                            <View style={styles.chatBubbleFileIcon}>
                              <Feather name="file-text" size={15} color="#38bdf8" />
                            </View>
                            <View style={{ flex: 1, marginLeft: 8 }}>
                              <Text style={styles.chatBubbleFileName} numberOfLines={1}>{msg.fileAttachment.name}</Text>
                              {msg.fileAttachment.size ? (
                                <Text style={styles.chatBubbleFileSize}>{(msg.fileAttachment.size / 1024).toFixed(1)} KB</Text>
                              ) : null}
                            </View>
                          </View>
                        )}

                        <Text style={styles.chatMessageText}>{msg.text}</Text>
                        <View style={styles.chatMetaRow}>
                          <Text style={styles.chatTimeText}>{msg.timestamp}</Text>
                          {msg.sender === 'user' && (
                            <Ionicons name="checkmark-done" size={14} color="#38bdf8" />
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                </ScrollView>

                {/* Pending Attachment Bar (Before Sending) */}
                {pendingAttachment && (
                  <View style={styles.pendingAttachmentBar}>
                    {pendingAttachment.type === 'image' ? (
                      <Image source={{ uri: pendingAttachment.uri }} style={styles.pendingAttachThumb} />
                    ) : (
                      <View style={styles.pendingAttachFileIcon}>
                        <Feather name="file-text" size={16} color="#38bdf8" />
                      </View>
                    )}
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.pendingAttachName} numberOfLines={1}>{pendingAttachment.name}</Text>
                      <Text style={styles.pendingAttachMeta}>
                        {pendingAttachment.type === 'image' ? 'Image ready for analysis' : pendingAttachment.size ? `${(pendingAttachment.size / 1024).toFixed(1)} KB ready` : 'Document ready'}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setPendingAttachment(null)} style={styles.pendingAttachRemoveBtn} activeOpacity={0.7}>
                      <Feather name="x" size={15} color="#94a3b8" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Multi-Attachment & Input Dock */}
                <View style={styles.tgInputDock}>
                  {/* Image / Vision Analysis Picker Button */}
                  <TouchableOpacity
                    style={styles.tgAttachBtn}
                    onPress={handlePickImage}
                    activeOpacity={0.7}
                  >
                    <Feather name="camera" size={18} color="#cbd5e1" />
                  </TouchableOpacity>

                  {/* File Document Attachment Picker Button */}
                  <TouchableOpacity
                    style={styles.tgAttachBtn}
                    onPress={handlePickDocument}
                    activeOpacity={0.7}
                  >
                    <Feather name="paperclip" size={18} color="#cbd5e1" />
                  </TouchableOpacity>

                  <TextInput
                    style={styles.chatInputField}
                    placeholder={pendingAttachment ? "Add a message or tap send..." : "Message Mikasa..."}
                    placeholderTextColor="#64748b"
                    value={chatInput}
                    onChangeText={setChatInput}
                    onSubmitEditing={() => executeCommand(chatInput, 'chat')}
                  />

                  {chatInput.trim().length > 0 || pendingAttachment ? (
                    <TouchableOpacity
                      style={styles.chatSendBtn}
                      onPress={() => executeCommand(chatInput, 'chat')}
                      activeOpacity={0.7}
                    >
                      <SendIcon color="#ffffff" size={15} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.chatVoiceMicBtn}
                      onPress={handleMicTap}
                      activeOpacity={0.7}
                    >
                      <MicrophoneIcon color="#ffffff" size={18} />
                    </TouchableOpacity>
                  )}
                </View>
              </KeyboardAvoidingView>
            )}

            {/* ========================================================
                TAB 3: ACTIONS (AUTOMATION CONTROL CENTER)
                Workflows + Reminders + Scheduled Jobs + Execution History + Sensitive Approvals
                (Covering the 13 Mobile Apps Control Domains)
                ======================================================== */}
            {navTab === 'actions' && (
              <ScrollView style={styles.subScreenContainer} contentContainerStyle={{ padding: 18, paddingBottom: 80 }}>
                <View style={styles.actionsTopHeaderRow}>
                  <View>
                    <Text style={styles.toolsMainTitle}>Actions Center</Text>
                    <Text style={styles.toolsMainSub}>Workflows, automations & device controls</Text>
                  </View>
                  <View style={styles.actionsRunningBadge}>
                    <Text style={styles.actionsRunningText}>PC Synced</Text>
                  </View>
                </View>

                {/* Sub-Filters: All | Device | Agenda | Workflows | Schedules | Approvals */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginVertical: 12 }}>
                  {(['All', 'Device', 'Agenda', 'Workflows', 'Schedules', 'Approvals'] as const).map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.cleanCatPill, actionCategory === cat && styles.cleanCatPillActive]}
                      onPress={() => setActionCategory(cat)}
                    >
                      <Text style={[styles.cleanCatText, actionCategory === cat && styles.cleanCatTextActive]}>
                        {cat === 'Agenda' ? 'Agenda & Tasks' : cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* 1. Sensitive Action Approvals (if pending) */}
                {(actionCategory === 'All' || actionCategory === 'Approvals') && pendingApprovals.length > 0 && (
                  <View style={styles.approvalSection}>
                    <Text style={styles.actionSectionHeader}>PENDING APPROVALS (SENSITIVE)</Text>
                    {pendingApprovals.map(appr => (
                      <View key={appr.id} style={styles.approvalCard}>
                        <View style={styles.approvalTopRow}>
                          <Text style={styles.approvalCardTitle}>{appr.title}</Text>
                          <View style={styles.approvalRiskPill}>
                            <Text style={styles.approvalRiskText}>{appr.risk} Risk</Text>
                          </View>
                        </View>
                        <Text style={styles.approvalCardDesc}>{appr.desc}</Text>
                        <View style={styles.approvalActionsRow}>
                          <TouchableOpacity
                            style={styles.approvalConfirmBtn}
                            onPress={() => {
                              setPendingApprovals([]);
                              speakAsMikasa('Approved. Deploying to production, Commander.');
                              Alert.alert('Action Executed', `${appr.title} has been authorized and dispatched.`);
                            }}
                            activeOpacity={0.8}
                          >
                            <Feather name="check" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                            <Text style={styles.approvalConfirmText}>Approve Action</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.approvalRejectBtn}
                            onPress={() => {
                              setPendingApprovals([]);
                              speakAsMikasa('Action canceled, Commander.');
                            }}
                            activeOpacity={0.8}
                          >
                            <Feather name="x" size={14} color="#94a3b8" style={{ marginRight: 6 }} />
                            <Text style={styles.approvalRejectText}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* 2. Device & System Control (13 Mobile Controls) */}
                {(actionCategory === 'All' || actionCategory === 'Device') && (
                  <View style={styles.actionSection}>
                    <Text style={styles.actionSectionHeader}>DEVICE & WORKSTATION CONTROLS</Text>

                    {/* Quick Grid Controls */}
                    <View style={styles.deviceActionGrid}>
                      <TouchableOpacity
                        style={styles.deviceActionTile}
                        onPress={() => triggerDeviceAction('lock')}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.deviceActionIconBox, { backgroundColor: 'rgba(225, 29, 72, 0.15)' }]}>
                          <Feather name="lock" size={20} color="#e11d48" />
                        </View>
                        <Text style={styles.deviceActionTileName}>Lock PC</Text>
                        <Text style={styles.deviceActionTileSub}>Win + L</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deviceActionTile}
                        onPress={() => triggerDeviceAction('vol_up')}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.deviceActionIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                          <Feather name="volume-2" size={20} color="#38bdf8" />
                        </View>
                        <Text style={styles.deviceActionTileName}>Vol Up</Text>
                        <Text style={styles.deviceActionTileSub}>+5 Steps</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deviceActionTile}
                        onPress={() => triggerDeviceAction('vol_down')}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.deviceActionIconBox, { backgroundColor: 'rgba(56, 189, 248, 0.15)' }]}>
                          <Feather name="volume-1" size={20} color="#38bdf8" />
                        </View>
                        <Text style={styles.deviceActionTileName}>Vol Down</Text>
                        <Text style={styles.deviceActionTileSub}>-5 Steps</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deviceActionTile}
                        onPress={() => triggerDeviceAction('mute')}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.deviceActionIconBox, { backgroundColor: 'rgba(244, 63, 94, 0.15)' }]}>
                          <Feather name="volume-x" size={20} color="#f43f5e" />
                        </View>
                        <Text style={styles.deviceActionTileName}>Mute</Text>
                        <Text style={styles.deviceActionTileSub}>Toggle</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deviceActionTile}
                        onPress={() => triggerDeviceAction('torch')}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.deviceActionIconBox, { backgroundColor: isFlashlightOn ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.1)' }]}>
                          <MaterialCommunityIcons name="flashlight" size={21} color={isFlashlightOn ? '#10b981' : '#94a3b8'} />
                        </View>
                        <Text style={styles.deviceActionTileName}>Flashlight</Text>
                        <Text style={[styles.deviceActionTileSub, isFlashlightOn && { color: '#10b981' }]}>
                          {isFlashlightOn ? 'ON' : 'OFF'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.deviceActionTile}
                        onPress={() => {
                          speakAsMikasa(`Battery level is ${batteryLevel} percent, connected and operating normally.`);
                        }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.deviceActionIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                          <Ionicons name="battery-charging-outline" size={22} color="#10b981" />
                        </View>
                        <Text style={styles.deviceActionTileName}>Battery</Text>
                        <Text style={styles.deviceActionTileSub}>{batteryLevel}% Charging</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* 2.5 Agenda & Tasks Section */}
                {(actionCategory === 'All' || actionCategory === 'Agenda') && (
                  <View style={styles.actionSection}>
                    <Text style={styles.actionSectionHeader}>TODAY'S AGENDA & TASKS</Text>
                    {agendaList.map(item => (
                      <View key={item.id} style={styles.agendaCard}>
                        <View style={styles.agendaTimeBox}>
                          <Text style={styles.agendaTimeText}>{item.time}</Text>
                        </View>
                        <View style={styles.agendaMeta}>
                          <Text style={styles.agendaTitleText}>{item.title}</Text>
                          <Text style={styles.agendaDescText}>{item.desc}</Text>
                        </View>
                      </View>
                    ))}

                    <View style={{ marginTop: 8 }}>
                      {activeTasks.map(task => (
                        <TouchableOpacity
                          key={task.id}
                          style={styles.taskItemRow}
                          onPress={() => {
                            setActiveTasks(prev =>
                              prev.map(t => (t.id === task.id ? { ...t, done: !t.done } : t))
                            );
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          }}
                        >
                          <View style={[styles.taskCheckbox, task.done && styles.taskCheckboxDone]}>
                            {task.done && <Feather name="check" size={11} color="#ffffff" />}
                          </View>
                          <Text style={[styles.taskTitleText, task.done && styles.taskTitleDone]}>
                            {task.title}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}

                {/* 3. Automation Workflows */}
                {(actionCategory === 'All' || actionCategory === 'Workflows') && (
                  <View style={styles.actionSection}>
                    <Text style={styles.actionSectionHeader}>AUTOMATED WORKFLOWS</Text>

                    <TouchableOpacity
                      style={styles.toolRowTile}
                      onPress={() => {
                        setNavTab('chat');
                        executeCommand('Give me a full morning sitrep briefing and PC status', 'chat');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#e11d48' }]}>
                        <Feather name="sun" size={18} color="#ffffff" />
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Morning Sitrep Briefing</Text>
                        <Text style={styles.toolTileDesc}>Weather, PC hardware, CurricuRAG status & agenda</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#64748b" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.toolRowTile}
                      onPress={() => {
                        setNavTab('chat');
                        executeCommand('Check latest commits on stark-os-portfolio repo', 'chat');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#2563eb' }]}>
                        <Feather name="git-commit" size={18} color="#ffffff" />
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>GitHub Commit Radar</Text>
                        <Text style={styles.toolTileDesc}>Inspect stark-os-portfolio and CurricuRAG branches</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#64748b" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.toolRowTile}
                      onPress={() => {
                        setNavTab('chat');
                        executeCommand('Generate LinkedIn job radar for AI and full-stack positions', 'chat');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#0284c7' }]}>
                        <Feather name="briefcase" size={18} color="#ffffff" />
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>LinkedIn Job Radar</Text>
                        <Text style={styles.toolTileDesc}>Scan remote fullstack and AI engineer openings</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#64748b" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.toolRowTile}
                      onPress={() => {
                        setNavTab('chat');
                        executeCommand('Check Edu51Portal server health and latency', 'chat');
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.toolTileIconBox, { backgroundColor: '#10b981' }]}>
                        <Feather name="shield" size={18} color="#ffffff" />
                      </View>
                      <View style={styles.toolTileMeta}>
                        <Text style={styles.toolTileName}>Edu51Portal Health Monitor</Text>
                        <Text style={styles.toolTileDesc}>Sub-second latency checks for BUBT CSE 51st students</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* 4. Scheduled Jobs & Reminders */}
                {(actionCategory === 'All' || actionCategory === 'Schedules') && (
                  <View style={styles.actionSection}>
                    <Text style={styles.actionSectionHeader}>SCHEDULED JOBS & CRON REMINDERS</Text>

                    <View style={styles.scheduleItemRow}>
                      <View style={styles.scheduleTimeBadge}>
                        <Text style={styles.scheduleTimeText}>09:00 AM</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.scheduleTitle}>Daily Morning Announcement</Text>
                        <Text style={styles.scheduleSub}>Speaks morning sitrep & calendar agenda</Text>
                      </View>
                      <Text style={{ color: '#10b981', fontWeight: 'bold' }}>Active</Text>
                    </View>

                    <View style={styles.scheduleItemRow}>
                      <View style={styles.scheduleTimeBadge}>
                        <Text style={styles.scheduleTimeText}>Every 10m</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.scheduleTitle}>Supabase Memory Extractor</Text>
                        <Text style={styles.scheduleSub}>Captures conversational facts automatically</Text>
                      </View>
                      <Text style={{ color: '#10b981', fontWeight: 'bold' }}>Active</Text>
                    </View>

                    <View style={styles.scheduleItemRow}>
                      <View style={styles.scheduleTimeBadge}>
                        <Text style={styles.scheduleTimeText}>Every 30m</Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.scheduleTitle}>PC Workstation Heartbeat</Text>
                        <Text style={styles.scheduleSub}>Broadcasts local LAN availability</Text>
                      </View>
                      <Text style={{ color: '#10b981', fontWeight: 'bold' }}>Active</Text>
                    </View>
                  </View>
                )}

                {/* 5. Execution History Log */}
                <View style={[styles.actionSection, { marginBottom: 30 }]}>
                  <Text style={styles.actionSectionHeader}>EXECUTION HISTORY</Text>
                  {actionLogs.map(log => (
                    <View key={log.id} style={styles.historyCard}>
                      <View style={styles.historyStatusIndicator} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitleText}>{log.title}</Text>
                        <Text style={styles.historySourceText}>{log.source} • {log.timestamp}</Text>
                      </View>
                      <Text style={styles.historySuccessPill}>SUCCESS</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            {/* ========================================================
                TAB 4: MEMORY (SEARCHABLE PERSONAL KNOWLEDGE SPACE)
                Facts + Projects + Goals + Preferences + Previous Context
                ======================================================== */}
            {navTab === 'memory' && (
              <View style={styles.subScreenContainer}>
                <View style={{ padding: 18 }}>
                  <View style={styles.sectionHeaderRow}>
                    <View>
                      <Text style={styles.toolsMainTitle}>Memory Vault</Text>
                      <Text style={styles.toolsMainSub}>Searchable personal knowledge space</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.addMemoryTriggerBtn}
                      onPress={() => setIsAddMemoryModal(true)}
                      activeOpacity={0.8}
                    >
                      <Feather name="plus" size={13} color="#ffffff" style={{ marginRight: 4 }} />
                      <Text style={styles.addMemoryTriggerText}>Add</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.cleanSearchInputBox}>
                    <Feather name="search" size={15} color="#64748b" style={{ marginRight: 8 }} />
                    <TextInput
                      style={styles.cleanSearchInput}
                      placeholder="Search facts, projects, goals..."
                      placeholderTextColor="#64748b"
                      value={memSearch}
                      onChangeText={setMemSearch}
                    />
                    {memSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setMemSearch('')} activeOpacity={0.7}>
                        <Feather name="x" size={15} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Filter Pills */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginVertical: 10 }}>
                    {(['All', 'fact', 'preference', 'workflow', 'decision'] as const).map(cat => {
                      const active = memFilter === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.cleanCatPill, active && styles.cleanCatPillActive]}
                          onPress={() => setMemFilter(cat)}
                        >
                          <Text style={[styles.cleanCatText, active && styles.cleanCatTextActive]}>
                            {cat === 'All' ? 'All Memories' : cat.toUpperCase()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Memory Cards Stream */}
                <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 90, gap: 10 }}>
                  {memories.map(mem => (
                    <View key={mem.id} style={styles.cleanMemCard}>
                      <View style={styles.cleanMemTop}>
                        <View style={styles.cleanMemTypeBadge}>
                          <Text style={styles.cleanMemTypeText}>{(mem.memory_type || 'FACT').toUpperCase()}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.memDeleteBtn}
                          onPress={() => handleDeleteMemory(mem.id)}
                          activeOpacity={0.7}
                        >
                          <Feather name="trash-2" size={13} color="#94a3b8" />
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.cleanMemContent}>{mem.content}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* ========================================================
                TAB 5: PROFILE (SETTINGS, PERMISSIONS & ASSISTANT BEHAVIOR)
                Voice + Language + Appearance + Connected Accounts + Permissions + Models
                ======================================================== */}
            {navTab === 'profile' && (
              <ScrollView style={styles.subScreenContainer} contentContainerStyle={{ padding: 18, paddingBottom: 80 }}>
                {/* Profile Card Header */}
                <View style={styles.profileHeaderCard}>
                  <Image source={require('./assets/mikasa.jpeg')} style={styles.profileCardAvatar} />
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.profileCardName}>Md. Miftahur Rahman Swapnil</Text>
                    <Text style={styles.profileCardSub}>Commander • Full-Stack AI Engineer</Text>
                    <View style={styles.profileTagRow}>
                      <View style={styles.profileTagBadge}>
                        <Text style={styles.profileTagText}>Mikasa v3.2</Text>
                      </View>
                      <View style={[styles.profileTagBadge, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <Text style={[styles.profileTagText, { color: '#10b981' }]}>Online</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* 1. Voice & Speech Settings */}
                <View style={styles.settingsGroupCard}>
                  <Text style={styles.settingsGroupHeader}>VOICE & SPEECH SYNTHESIS</Text>

                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Speech Engine</Text>
                    <Text style={styles.settingsVal}>Gemini HD + Native TTS</Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Voice Gender</Text>
                    <Text style={[styles.settingsVal, { color: '#e11d48' }]}>Mikasa Natural Female</Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Speech Speed</Text>
                    <Text style={styles.settingsVal}>{speechRate.toFixed(1)}x</Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <View>
                      <Text style={styles.settingsLabel}>Wake Word ("Hey Mikasa")</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <View style={[styles.statusDot, { backgroundColor: isWakeWordListening ? '#10b981' : '#64748b' }]} />
                        <Text style={{ fontSize: 11, color: isWakeWordListening ? '#10b981' : '#64748b' }}>
                          {isWakeWordListening ? 'Standby listening active' : 'Tap switch to enable'}
                        </Text>
                      </View>
                    </View>
                    <Switch
                      value={isWakeWordEnabled}
                      onValueChange={handleToggleWakeWord}
                      trackColor={{ false: '#334155', true: '#e11d48' }}
                      thumbColor="#ffffff"
                    />
                  </View>
                </View>

                {/* Hardware & System Permissions */}
                <View style={styles.settingsGroupCard}>
                  <Text style={styles.settingsGroupHeader}>DEVICE HARDWARE & PERMISSIONS</Text>

                  <TouchableOpacity
                    style={styles.settingsRow}
                    activeOpacity={0.7}
                    onPress={requestMicPermission}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(225, 29, 72, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="mic" size={14} color="#e11d48" />
                      </View>
                      <Text style={styles.settingsLabel}>Microphone Access</Text>
                    </View>
                    <Text style={[styles.settingsVal, { color: micPermissionGranted ? '#10b981' : '#e11d48' }]}>
                      {micPermissionGranted ? 'Granted' : 'Tap to Grant'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.settingsRow}
                    activeOpacity={0.7}
                    onPress={requestCameraPermission}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(56, 189, 248, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="camera" size={14} color="#38bdf8" />
                      </View>
                      <Text style={styles.settingsLabel}>Camera / Flashlight</Text>
                    </View>
                    <Text style={[styles.settingsVal, { color: cameraPermissionGranted ? '#10b981' : '#e11d48' }]}>
                      {cameraPermissionGranted ? 'Granted' : 'Tap to Grant'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.settingsRow}
                    activeOpacity={0.7}
                    onPress={requestLocationPermission}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="map-pin" size={14} color="#10b981" />
                      </View>
                      <Text style={styles.settingsLabel}>Geolocation Service</Text>
                    </View>
                    <Text style={[styles.settingsVal, { color: locationPermissionGranted ? '#10b981' : '#f59e0b' }]}>
                      {locationPermissionGranted ? 'Granted' : 'Optional (Grant)'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* 2. Appearance & Cockpit HUD */}
                <View style={styles.settingsGroupCard}>
                  <Text style={styles.settingsGroupHeader}>APPEARANCE & HUD</Text>

                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Theme</Text>
                    <Text style={styles.settingsVal}>Cyberpunk Crimson Dark</Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Live Waveform Visualizer</Text>
                    <Switch
                      value={hudWaveformEnabled}
                      onValueChange={setHudWaveformEnabled}
                      trackColor={{ false: '#334155', true: '#e11d48' }}
                      thumbColor="#ffffff"
                    />
                  </View>
                </View>

                {/* 3. Connected Accounts & Bridge */}
                <View style={styles.settingsGroupCard}>
                  <Text style={styles.settingsGroupHeader}>CONNECTED SERVICES</Text>

                  <View style={styles.settingsRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(56, 189, 248, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="send" size={13} color="#38bdf8" />
                      </View>
                      <Text style={styles.settingsLabel}>Telegram Bridge</Text>
                    </View>
                    <Text style={[styles.settingsVal, { color: '#10b981' }]}>@mikasa_360_bot (Active)</Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(16, 185, 129, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="monitor" size={13} color="#10b981" />
                      </View>
                      <Text style={styles.settingsLabel}>Workstation PC</Text>
                    </View>
                    <Text style={[styles.settingsVal, { color: pcOnline ? '#10b981' : '#f59e0b' }]}>
                      {pcOnline ? 'Swapnil-PC (192.168.10.130)' : 'Standby'}
                    </Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(225, 29, 72, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons name="brain" size={14} color="#e11d48" />
                      </View>
                      <Text style={styles.settingsLabel}>Supabase DB</Text>
                    </View>
                    <Text style={[styles.settingsVal, { color: '#10b981' }]}>123+ Memories Loaded</Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: 'rgba(168, 85, 247, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="git-branch" size={13} color="#a855f7" />
                      </View>
                      <Text style={styles.settingsLabel}>GitHub Repository</Text>
                    </View>
                    <Text style={styles.settingsVal}>Swapnil-360</Text>
                  </View>
                </View>

                {/* 4. Model Preferences & Brain */}
                <View style={styles.settingsGroupCard}>
                  <Text style={styles.settingsGroupHeader}>NEURAL MODEL PREFERENCES</Text>

                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Primary Engine</Text>
                    <Text style={styles.settingsVal}>gemini-3.5-flash-lite</Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Failover Engine</Text>
                    <Text style={styles.settingsVal}>gpt-4o-mini</Text>
                  </View>

                  <View style={styles.settingsRow}>
                    <Text style={styles.settingsLabel}>Proactive Surveillance</Text>
                    <Switch
                      value={isProactiveEnabled}
                      onValueChange={setIsProactiveEnabled}
                      trackColor={{ false: '#334155', true: '#e11d48' }}
                      thumbColor="#ffffff"
                    />
                  </View>
                </View>

                {/* 5. Replay Onboarding Guide */}
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
                MAIN NAVIGATION BAR (Exact Match to Image-1)
                5 Segmented Primary Tabs: Home | Chat | Actions | Memory | Profile
                ======================================================== */}
            <View style={styles.bottomNavBar}>
              <TouchableOpacity
                style={[styles.bottomNavBtn, navTab === 'home' && styles.bottomNavBtnActive]}
                onPress={() => setNavTab('home')}
                activeOpacity={0.7}
              >
                <HomeIcon active={navTab === 'home'} />
                <Text style={[styles.bottomNavLabel, navTab === 'home' && styles.bottomNavLabelActive]}>
                  Home
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bottomNavBtn, navTab === 'chat' && styles.bottomNavBtnActive]}
                onPress={() => setNavTab('chat')}
                activeOpacity={0.7}
              >
                <ChatIcon active={navTab === 'chat'} />
                <Text style={[styles.bottomNavLabel, navTab === 'chat' && styles.bottomNavLabelActive]}>
                  Chat
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bottomNavBtn, navTab === 'actions' && styles.bottomNavBtnActive]}
                onPress={() => setNavTab('actions')}
                activeOpacity={0.7}
              >
                <ActionsIcon active={navTab === 'actions'} />
                <Text style={[styles.bottomNavLabel, navTab === 'actions' && styles.bottomNavLabelActive]}>
                  Actions
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bottomNavBtn, navTab === 'memory' && styles.bottomNavBtnActive]}
                onPress={() => setNavTab('memory')}
                activeOpacity={0.7}
              >
                <MemoryIcon active={navTab === 'memory'} />
                <Text style={[styles.bottomNavLabel, navTab === 'memory' && styles.bottomNavLabelActive]}>
                  Memory
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.bottomNavBtn, navTab === 'profile' && styles.bottomNavBtnActive]}
                onPress={() => setNavTab('profile')}
                activeOpacity={0.7}
              >
                <ProfileIcon active={navTab === 'profile'} />
                <Text style={[styles.bottomNavLabel, navTab === 'profile' && styles.bottomNavLabelActive]}>
                  Profile
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ========================================================
            ADD MEMORY MODAL SHEET
            ======================================================== */}
        <Modal
          visible={isAddMemoryModal}
          transparent
          animationType="fade"
          onRequestClose={() => setIsAddMemoryModal(false)}
        >
          <View style={styles.profileModalBackdrop}>
            <View style={styles.addMemorySheet}>
              <Text style={styles.addMemoryTitle}>Record New Memory</Text>
              <Text style={styles.addMemorySub}>Saves permanently to Mikasa's Supabase brain</Text>

              <TextInput
                style={styles.addMemoryTextInput}
                placeholder="Type fact, project update, or preference..."
                placeholderTextColor="#64748b"
                multiline
                numberOfLines={4}
                value={newMemContent}
                onChangeText={setNewMemContent}
              />

              <View style={styles.addMemoryTypeRow}>
                {(['fact', 'preference', 'project', 'goal'] as const).map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.addMemoryTypePill, newMemType === t && styles.addMemoryTypePillActive]}
                    onPress={() => setNewMemType(t)}
                  >
                    <Text style={[styles.addMemoryTypeText, newMemType === t && styles.addMemoryTypeTextActive]}>
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.addMemoryBtnRow}>
                <TouchableOpacity
                  style={styles.addMemoryCancelBtn}
                  onPress={() => setIsAddMemoryModal(false)}
                >
                  <Text style={styles.addMemoryCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.addMemorySaveBtn}
                  onPress={handleAddMemory}
                >
                  <Text style={styles.addMemorySaveText}>Save to Memory</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

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
              <View style={styles.profileSheetTop}>
                <Text style={styles.profileSheetMainTitle}>Agent Profile & Controls</Text>
                <TouchableOpacity
                  style={styles.profileCloseBtn}
                  onPress={() => setProfileModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={16} color="#cbd5e1" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
                <View style={styles.profileAvatarCenterBox}>
                  <View style={styles.profileAvatarHalo}>
                    <Image source={require('./assets/mikasa.jpeg')} style={styles.profileAvatarImg} />
                  </View>
                  <Text style={styles.profileName}>MIKASA</Text>
                  <View style={styles.profileOnlineBadge}>
                    <View style={[styles.statusDot, { backgroundColor: '#10b981' }]} />
                    <Text style={styles.profileOnlineText}>Autonomous Companion Online</Text>
                  </View>
                </View>

                <View style={styles.profileSectionBox}>
                  <Text style={styles.profileSecTitle}>QUICK INTRO</Text>
                  <TouchableOpacity
                    style={styles.profilePlayBtn}
                    onPress={() => {
                      setProfileModalVisible(false);
                      playAboutMeAudio();
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="headphones" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.profilePlayBtnText}>Play "About Mikasa" Audio</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                <View style={styles.profileSectionBox}>
                  <Text style={styles.profileSecTitle}>ONBOARDING GUIDE</Text>
                  <TouchableOpacity
                    style={styles.profileGuideBtn}
                    onPress={() => {
                      setProfileModalVisible(false);
                      setOnboardingStep(1);
                      setAppFlow('onboarding');
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="book-open" size={16} color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.profileGuideBtnText}>Replay Onboarding Guide</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ========================================================
            SITREP & BRIEFING NOTIFICATION MODAL (Tapping 🔔 in Home)
            Agenda + Active Tasks + Recent Activity Log
            ======================================================== */}
        <Modal
          visible={sitrepModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setSitrepModalVisible(false)}
        >
          <View style={styles.profileModalBackdrop}>
            <View style={styles.profileModalSheet}>
              <View style={styles.profileSheetTop}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(225, 29, 72, 0.15)', alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name="bell" size={17} color="#e11d48" />
                  </View>
                  <View>
                    <Text style={styles.profileSheetMainTitle}>Commander Sitrep</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>Daily Agenda, Tasks & Live Logs</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.profileCloseBtn}
                  onPress={() => setSitrepModalVisible(false)}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={16} color="#cbd5e1" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24, paddingTop: 10 }}>
                {/* 1. Today's Agenda */}
                <View style={{ marginBottom: 18 }}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Today's Agenda</Text>
                    <Text style={styles.sectionActionText}>3 Events</Text>
                  </View>

                  {agendaList.map(item => (
                    <View key={item.id} style={styles.agendaCard}>
                      <View style={styles.agendaTimeBox}>
                        <Text style={styles.agendaTimeText}>{item.time}</Text>
                      </View>
                      <View style={styles.agendaMeta}>
                        <Text style={styles.agendaTitleText}>{item.title}</Text>
                        <Text style={styles.agendaDescText}>{item.desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* 2. Active Tasks */}
                <View style={{ marginBottom: 18 }}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Active Tasks</Text>
                    <Text style={styles.sectionActionText}>Synced</Text>
                  </View>

                  {activeTasks.map(task => (
                    <TouchableOpacity
                      key={task.id}
                      style={styles.taskItemRow}
                      onPress={() => {
                        setActiveTasks(prev =>
                          prev.map(t => (t.id === task.id ? { ...t, done: !t.done } : t))
                        );
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }}
                    >
                      <View style={[styles.taskCheckbox, task.done && styles.taskCheckboxDone]}>
                        {task.done && <Feather name="check" size={11} color="#ffffff" />}
                      </View>
                      <Text style={[styles.taskTitleText, task.done && styles.taskTitleDone]}>
                        {task.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 3. Recent Activity */}
                <View style={{ marginBottom: 10 }}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Recent Activity</Text>
                    <Text style={styles.sectionActionText}>Live Log</Text>
                  </View>

                  {actionLogs.map(log => (
                    <View key={log.id} style={styles.recentActivityRow}>
                      <View style={[styles.activityDot, { backgroundColor: '#e11d48' }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.activityTitle}>{log.title}</Text>
                        <Text style={styles.activitySub}>{log.source} • {log.timestamp}</Text>
                      </View>
                      <View style={styles.activitySuccessBadge}>
                        <Text style={styles.activitySuccessText}>{log.status}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* ========================================================
   STYLESHEET (Cyberpunk Crimson Dark Cockpit)
   ======================================================== */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07080c'
  },

  // ── SPLASH SCREEN (Mockup Screen 1) ──────────────────────────────────────
  splashScreen: {
    flex: 1,
    backgroundColor: '#07080c',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: height * 0.05,
    paddingBottom: Platform.OS === 'ios' ? 44 : 36
  },
  splashImgWrapper: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  splashPortraitCentered: {
    width: width * 0.88,
    height: height * 0.52
  },
  splashBottomContent: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 24,
    gap: 8
  },
  splashMLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(225,29,72,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(225,29,72,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4
  },
  splashBrandTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 6,
    textAlign: 'center'
  },
  splashBrandSub: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 12
  },
  splashLoadBarTrack: {
    width: 170,
    height: 3.5,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 2,
    overflow: 'hidden'
  },
  splashLoadBarFill: {
    height: '100%',
    backgroundColor: '#e11d48',
    borderRadius: 2
  },

  // ── ONBOARDING SHARED ───────────────────────────────────────────────────────
  onboardScreen: {
    flex: 1,
    backgroundColor: '#07080c',
    justifyContent: 'space-between'
  },
  obTopBar: {
    paddingTop: 52,
    paddingHorizontal: 24,
    marginBottom: 16
  },
  obBrand: {
    fontSize: 14,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 4
  },

  // ── ONBOARDING STEP 1: text-left / portrait-right ──────────────────────────
  ob1Screen: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  ob1Body: {
    flex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative'
  },
  ob1TextCol: {
    width: width * 0.54,
    paddingLeft: 24,
    paddingRight: 6,
    paddingTop: 12,
    zIndex: 2
  },
  ob1HeroLine: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    lineHeight: 38,
    marginBottom: 14
  },
  ob1Sub: {
    fontSize: 13,
    color: '#94a3b8',
    lineHeight: 20
  },
  ob1Portrait: {
    position: 'absolute',
    right: -width * 0.08,
    bottom: 0,
    width: width * 0.68,
    height: height * 0.58
  },

  // ── ONBOARDING STEPS 2-5 shared slide layout ───────────────────────────────
  obSlide: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  obSlideContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 6
  },
  obHero: {
    fontSize: 32,
    fontWeight: '900',
    color: '#ffffff',
    lineHeight: 38,
    marginBottom: 10
  },
  obSub: {
    fontSize: 14,
    color: '#94a3b8',
    lineHeight: 21,
    marginBottom: 24
  },
  obRed: {
    color: '#e11d48'
  },

  // Step 2: Waveform + Command bubbles
  obWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginVertical: 18
  },
  obWaveBar: {
    width: 4.5,
    borderRadius: 3,
    backgroundColor: '#e11d48'
  },
  obBubblesCol: {
    gap: 12,
    marginTop: 8
  },
  obCmdBubble: {
    backgroundColor: '#11141e',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e2436',
    paddingVertical: 14,
    paddingHorizontal: 18
  },
  obCmdBubbleText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600'
  },

  // Step 3: App icon squircle grid
  obAppGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    marginTop: 10
  },
  obAppCard: {
    width: (width - 48 - 24) / 3,
    height: 88,
    backgroundColor: '#11141e',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e2436',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  obAppCardIcon: {
    fontSize: 26
  },
  obAppCardLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600'
  },

  // Step 4: Glowing avatar
  obAvatarWrapper: {
    width: 140,
    height: 140,
    alignSelf: 'center',
    marginTop: 20,
    marginBottom: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  obAvatarRingOuter: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(225,29,72,0.25)'
  },
  obAvatarRingInner: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 2.5,
    borderColor: '#e11d48'
  },
  obAvatarImg: {
    width: 98,
    height: 98,
    borderRadius: 49
  },
  obAvatarName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 6
  },
  obOnlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  obOnlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981'
  },
  obOnlineText: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '700'
  },

  // Step 5: Ready to begin
  obReadyWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28
  },
  obReadyPulseOuter: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(225,29,72,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(225,29,72,0.3)'
  },
  obReadyPulseInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#151926',
    borderWidth: 2,
    borderColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center'
  },
  obReadyNote: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 24,
    textAlign: 'center'
  },


  onboardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 24
  },
  onboardStepCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#e11d48',
    letterSpacing: 1.5
  },
  onboardCloseText: {
    fontSize: 18,
    color: '#94a3b8',
    padding: 4
  },
  onboardSlideBody: {
    alignItems: 'center',
    paddingVertical: 20
  },
  onboardTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8
  },
  onboardSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    paddingHorizontal: 20,
    marginBottom: 28
  },
  onboardHeroCard: {
    width: '100%',
    backgroundColor: '#13161f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#222634',
    padding: 20,
    alignItems: 'center'
  },
  onboardHeroImg: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#e11d48',
    marginBottom: 14
  },
  onboardCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 4
  },
  onboardCardDesc: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center'
  },
  onboardMicShowcaseBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30
  },
  onboardMicSub: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 20
  },
  onboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
    width: '100%'
  },
  onboardSquircleTile: {
    width: (width - 72) / 2,
    backgroundColor: '#13161f',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#222634',
    padding: 18,
    alignItems: 'center'
  },
  onboardSquircleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 8
  },
  onboardAvatarCenterBox: {
    alignItems: 'center'
  },
  onboardAvatarGlowRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    marginBottom: 14
  },
  onboardAvatarCoreImg: {
    width: 104,
    height: 104,
    borderRadius: 52
  },
  onboardAvatarCoreName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2
  },
  onboardAvatarCoreStatus: {
    fontSize: 12,
    color: '#10b981',
    fontWeight: '700',
    marginTop: 4
  },
  onboardBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 24 : 32
  },
  onboardSkipBtn: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 4
  },
  onboardDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  onboardDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#222634'
  },
  onboardDotActive: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e11d48'
  },
  onboardNextBtn: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 22,
    paddingVertical: 10,
    borderRadius: 20
  },
  onboardNextBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },

  homeScrollScreen: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  hudTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 8
  },
  hudBrandLeft: {
    flex: 1
  },
  hudGreetingText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5
  },
  hudStatusDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5
  },
  statusDotText: {
    fontSize: 11,
    color: '#94a3b8',
    fontWeight: '600'
  },
  hudAvatarBorder: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#e11d48',
    overflow: 'hidden'
  },
  hudAvatarImg: {
    width: '100%',
    height: '100%'
  },
  homeStationaryStage: {
    alignItems: 'center',
    paddingVertical: 20
  },
  orbStageWrapper: {
    width: 170,
    height: 170,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  orbConcentricRingOuter: {
    position: 'absolute',
    width: 166,
    height: 166,
    borderRadius: 83,
    borderWidth: 1.5
  },
  orbConcentricRingInner: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    borderWidth: 1.8
  },
  crimsonEnergyOrb: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 2.2,
    borderColor: '#e11d48',
    elevation: 8,
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 16
  },
  crimsonEnergyOrbListening: {
    borderColor: '#ff1744',
    shadowOpacity: 0.9,
    shadowRadius: 24
  },
  modernVideoOrb: {
    width: '100%',
    height: '100%'
  },
  orbTitleText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 2,
    marginTop: 14
  },
  orbReadyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  },
  orbReadyText: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600'
  },
  orbSubtitlePromptRed: {
    fontSize: 13,
    fontWeight: '700',
    color: '#e11d48',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 10
  },
  aboutMeAudioPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161922',
    borderWidth: 1,
    borderColor: '#262935',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    marginTop: 12,
    gap: 6
  },
  aboutMeAudioPillIcon: {
    fontSize: 13
  },
  aboutMeAudioPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff'
  },
  homeMicAnchor: {
    alignItems: 'center',
    paddingVertical: 14
  },
  orbitalMicWrapper: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  orbitalRingGlow: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#e11d48',
    borderStyle: 'dashed'
  },
  floatingMicBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#13161f',
    borderWidth: 1.5,
    borderColor: '#262935',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6
  },
  floatingMicBtnActive: {
    backgroundColor: '#e11d48',
    borderColor: '#ff4d6d'
  },
  tapToSpeakLabel: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 8,
    fontWeight: '600'
  },
  liveAudioWaveformBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    gap: 4,
    marginTop: 12
  },
  liveWaveformBar: {
    width: 4,
    backgroundColor: '#e11d48',
    borderRadius: 2
  },

  // HOME DASHBOARD SECTIONS
  dashboardSection: {
    paddingHorizontal: 18,
    marginTop: 18
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5
  },
  sectionActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#e11d48'
  },
  agendaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#202432',
    padding: 12,
    marginBottom: 8
  },
  agendaTimeBox: {
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.3)'
  },
  agendaTimeText: {
    color: '#e11d48',
    fontSize: 11,
    fontWeight: '800'
  },
  agendaMeta: {
    flex: 1,
    marginLeft: 12
  },
  agendaTitleText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  agendaDescText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2
  },
  taskItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#202432',
    padding: 12,
    marginBottom: 6
  },
  taskCheckbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#64748b',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  taskCheckboxDone: {
    backgroundColor: '#10b981',
    borderColor: '#10b981'
  },
  taskTitleText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600'
  },
  taskTitleDone: {
    color: '#64748b',
    textDecorationLine: 'line-through'
  },
  recentActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#161922'
  },
  activityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 10
  },
  activityTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  activitySub: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2
  },
  activitySuccessBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6
  },
  activitySuccessText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800'
  },

  // CHAT SCREEN (TELEGRAM @mikasa_360_bot STYLE)
  chatTabScreen: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  tgChatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0d0f15',
    borderBottomWidth: 1,
    borderBottomColor: '#1b1f2b'
  },
  tgAvatarBox: {
    position: 'relative'
  },
  tgAvatarImg: {
    width: 38,
    height: 38,
    borderRadius: 19
  },
  tgOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10b981',
    borderWidth: 1.5,
    borderColor: '#0d0f15'
  },
  tgHeaderName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  tgHeaderStatus: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '600'
  },
  tgSearchIconBtn: {
    padding: 6
  },
  chatSearchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141c',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#202432'
  },
  chatSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13
  },
  tgMemoryBanner: {
    backgroundColor: 'rgba(225, 29, 72, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(225, 29, 72, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  tgMemoryBannerText: {
    color: '#e11d48',
    fontSize: 10,
    fontWeight: '700'
  },
  chatMessageScroll: {
    flex: 1
  },
  chatBubbleRow: {
    flexDirection: 'row',
    marginBottom: 6
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
    marginRight: 8,
    marginTop: 4
  },
  chatBubble: {
    maxWidth: width * 0.76,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 16
  },
  chatBubbleUser: {
    backgroundColor: '#e11d48',
    borderBottomRightRadius: 4
  },
  chatBubbleMikasa: {
    backgroundColor: '#141722',
    borderWidth: 1,
    borderColor: '#222636',
    borderBottomLeftRadius: 4
  },
  chatToolBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center'
  },
  chatToolBadgeText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800'
  },
  chatMessageText: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18
  },
  chatMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 4
  },
  chatTimeText: {
    fontSize: 9,
    color: '#94a3b8'
  },
  chatCheckmarks: {
    fontSize: 10,
    color: '#ffffff',
    fontWeight: 'bold'
  },
  chatBubbleImg: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 8
  },
  chatBubbleFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)'
  },
  chatBubbleFileIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chatBubbleFileName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff'
  },
  chatBubbleFileSize: {
    fontSize: 10,
    color: '#94a3b8',
    marginTop: 2
  },
  pendingAttachmentBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12151d',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#1e2433',
    marginHorizontal: 10,
    marginBottom: 4,
    borderRadius: 10
  },
  pendingAttachThumb: {
    width: 36,
    height: 36,
    borderRadius: 6
  },
  pendingAttachFileIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pendingAttachName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff'
  },
  pendingAttachMeta: {
    fontSize: 10,
    color: '#38bdf8',
    marginTop: 2
  },
  pendingAttachRemoveBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8
  },
  tgInputDock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#0d0f15',
    borderTopWidth: 1,
    borderTopColor: '#1b1f2b',
    gap: 6
  },
  tgAttachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#161922',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chatInputField: {
    flex: 1,
    backgroundColor: '#161922',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#252936'
  },
  chatSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#e11d48',
    alignItems: 'center',
    justifyContent: 'center'
  },
  chatVoiceMicBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e2230',
    alignItems: 'center',
    justifyContent: 'center'
  },

  // ACTIONS CENTER TAB
  subScreenContainer: {
    flex: 1,
    backgroundColor: '#07080c'
  },
  actionsTopHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  toolsMainTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 0.5
  },
  toolsMainSub: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  actionsRunningBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8
  },
  actionsRunningText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800'
  },
  actionSection: {
    marginTop: 18
  },
  actionSectionHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#e11d48',
    letterSpacing: 1.5,
    marginBottom: 10
  },
  approvalSection: {
    marginTop: 10,
    marginBottom: 14
  },
  approvalCard: {
    backgroundColor: '#141620',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e11d48',
    padding: 14
  },
  approvalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  approvalCardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  approvalRiskPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  approvalRiskText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800'
  },
  approvalCardDesc: {
    color: '#94a3b8',
    fontSize: 12,
    marginVertical: 8
  },
  approvalActionsRow: {
    flexDirection: 'row',
    gap: 10
  },
  approvalConfirmBtn: {
    flex: 1,
    backgroundColor: '#e11d48',
    borderRadius: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  approvalConfirmText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  approvalRejectBtn: {
    backgroundColor: '#222634',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center'
  },
  approvalRejectText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700'
  },
  deviceActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  deviceActionTile: {
    width: (width - 56) / 3,
    backgroundColor: '#12141c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#202432',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  deviceActionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)'
  },
  deviceActionTileName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2
  },
  deviceActionTileSub: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2
  },
  toolRowTile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#202432',
    padding: 14,
    marginBottom: 8
  },
  toolTileIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  toolTileMeta: {
    flex: 1,
    marginLeft: 12
  },
  toolTileName: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  toolTileDesc: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2
  },
  scheduleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#202432',
    padding: 12,
    marginBottom: 6
  },
  scheduleTimeBadge: {
    backgroundColor: 'rgba(225, 29, 72, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(225, 29, 72, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8
  },
  scheduleTimeText: {
    color: '#e11d48',
    fontSize: 10,
    fontWeight: '800'
  },
  scheduleTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700'
  },
  scheduleSub: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141c',
    borderRadius: 10,
    padding: 10,
    marginBottom: 6
  },
  historyStatusIndicator: {
    width: 4,
    height: 24,
    borderRadius: 2,
    backgroundColor: '#10b981',
    marginRight: 10
  },
  historyTitleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600'
  },
  historySourceText: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2
  },
  historySuccessPill: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800'
  },

  // MEMORY VAULT TAB
  addMemoryTriggerBtn: {
    backgroundColor: '#e11d48',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  addMemoryTriggerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  cleanSearchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141c',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#202432',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 9 : 4,
    marginTop: 10
  },
  cleanSearchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13
  },
  cleanCatPill: {
    backgroundColor: '#12141c',
    borderWidth: 1,
    borderColor: '#202432',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14
  },
  cleanCatPillActive: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    borderColor: '#e11d48'
  },
  cleanCatText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600'
  },
  cleanCatTextActive: {
    color: '#ffffff',
    fontWeight: '800'
  },
  cleanMemCard: {
    backgroundColor: '#12141c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#202432',
    padding: 14
  },
  cleanMemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  cleanMemTypeBadge: {
    backgroundColor: 'rgba(225, 29, 72, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  cleanMemTypeText: {
    color: '#e11d48',
    fontSize: 9,
    fontWeight: '800'
  },
  memDeleteBtn: {
    padding: 4
  },
  memDeleteText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: 'bold'
  },
  cleanMemContent: {
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 18
  },

  // ADD MEMORY MODAL
  addMemorySheet: {
    width: '90%',
    backgroundColor: '#12141c',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#242838',
    padding: 20
  },
  addMemoryTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800'
  },
  addMemorySub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
    marginBottom: 14
  },
  addMemoryTextInput: {
    backgroundColor: '#0a0b10',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e2230',
    color: '#ffffff',
    padding: 12,
    fontSize: 13,
    textAlignVertical: 'top'
  },
  addMemoryTypeRow: {
    flexDirection: 'row',
    gap: 6,
    marginVertical: 12
  },
  addMemoryTypePill: {
    flex: 1,
    backgroundColor: '#181b26',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center'
  },
  addMemoryTypePillActive: {
    backgroundColor: '#e11d48'
  },
  addMemoryTypeText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700'
  },
  addMemoryTypeTextActive: {
    color: '#ffffff'
  },
  addMemoryBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6
  },
  addMemoryCancelBtn: {
    flex: 1,
    backgroundColor: '#181b26',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  addMemoryCancelText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700'
  },
  addMemorySaveBtn: {
    flex: 1,
    backgroundColor: '#e11d48',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  addMemorySaveText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },

  // PROFILE TAB
  profileHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12141c',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202432',
    padding: 16,
    marginBottom: 14
  },
  profileCardAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#e11d48'
  },
  profileCardName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  profileCardSub: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2
  },
  profileTagRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8
  },
  profileTagBadge: {
    backgroundColor: 'rgba(225, 29, 72, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6
  },
  profileTagText: {
    color: '#e11d48',
    fontSize: 10,
    fontWeight: '700'
  },
  settingsGroupCard: {
    backgroundColor: '#12141c',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#202432',
    padding: 16,
    marginBottom: 12
  },
  settingsGroupHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#e11d48',
    letterSpacing: 1.5,
    marginBottom: 12
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#181b26'
  },
  settingsLabel: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600'
  },
  settingsVal: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600'
  },
  onboardReplayBtn: {
    backgroundColor: '#12141c',
    borderWidth: 1,
    borderColor: '#242838',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 6
  },
  onboardReplayText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },

  // BOTTOM NAVIGATION BAR (MATCHING IMAGE-1)
  bottomNavBar: {
    flexDirection: 'row',
    backgroundColor: '#090a0f',
    borderTopWidth: 1,
    borderTopColor: '#1e2230',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    gap: 6
  },
  bottomNavBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 2,
    borderRadius: 14,
    backgroundColor: '#13161f',
    borderWidth: 1,
    borderColor: '#222634'
  },
  bottomNavBtnActive: {
    backgroundColor: 'rgba(225, 29, 72, 0.08)',
    borderColor: '#e11d48',
    borderWidth: 1.2
  },
  bottomNavLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 4
  },
  bottomNavLabelActive: {
    color: '#ffffff',
    fontWeight: '800'
  },

  // AGENT PROFILE MODAL
  profileModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  profileModalSheet: {
    width: '90%',
    maxHeight: '80%',
    backgroundColor: '#12141c',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#242838',
    padding: 20
  },
  profileSheetTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  profileSheetMainTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  profileCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#161925',
    borderWidth: 1,
    borderColor: '#24283b',
    alignItems: 'center',
    justifyContent: 'center'
  },
  profileCloseBtnText: {
    color: '#94a3b8',
    fontSize: 16
  },
  profileAvatarCenterBox: {
    alignItems: 'center',
    marginVertical: 10
  },
  profileAvatarHalo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#e11d48',
    overflow: 'hidden',
    marginBottom: 10
  },
  profileAvatarImg: {
    width: '100%',
    height: '100%'
  },
  profileName: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2
  },
  profileOnlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4
  },
  profileOnlineText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700'
  },
  profileSectionBox: {
    marginTop: 14
  },
  profileSecTitle: {
    color: '#e11d48',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8
  },
  profilePlayBtn: {
    backgroundColor: '#e11d48',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center'
  },
  profilePlayBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },
  profileGuideBtn: {
    backgroundColor: '#181b26',
    borderWidth: 1,
    borderColor: '#242838',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center'
  },
  profileGuideBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700'
  },

  // HUD BELL & HOME VOICE STYLES
  homeVoiceScreen: {
    flex: 1,
    backgroundColor: '#07080c',
    justifyContent: 'space-between',
    paddingBottom: 16
  },
  hudBrandName: {
    fontSize: 20,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 4
  },
  hudBellBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#13161f',
    borderWidth: 1,
    borderColor: '#242838',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  hudBellBadge: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#e11d48'
  },
  executingCardOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(15, 17, 26, 0.95)',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#e11d48',
    padding: 16,
    zIndex: 100
  },
  execHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10
  },
  execIconSym: {
    color: '#e11d48',
    fontSize: 16,
    fontWeight: '900'
  },
  execCardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  execStepsBox: {
    gap: 6
  },
  execStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  execStepStatusIcon: {
    fontSize: 12,
    color: '#94a3b8'
  },
  execStepLabel: {
    color: '#cbd5e1',
    fontSize: 12
  },
  execStepDone: {
    color: '#10b981',
    textDecorationLine: 'line-through'
  },
  execCancelBtn: {
    marginTop: 10,
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#202434'
  },
  execCancelText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700'
  }
});
