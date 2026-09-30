// mikasa-mobile/wakeWordCoordinator.ts
// Hands-free ambient voice state machine with Voice Activity Detection (VAD) and Echo Suppression

import { matchWakeWord, WakeWordResult } from './wakeWordMatcher';

export type VoiceState =
  | 'STANDBY_LISTENING'
  | 'WAKE_DETECTED'
  | 'COMMAND_LISTENING'
  | 'PROCESSING'
  | 'SPEAKING';

export interface CoordinatorOptions {
  vadSilenceMs?: number;       // Time of silence before command auto-submits (default 1200ms)
  echoCooldownMs?: number;     // Silence period after speaking before unmuting wake word (default 500ms)
  maxCommandDurationMs?: number; // Safety timeout for command recording (default 10000ms)
  onStateChange?: (state: VoiceState, prevState: VoiceState) => void;
  onWakeDetected?: (trigger: string, remainder: string) => void;
  onCommandChunk?: (text: string) => void;
  onCommandReady?: (command: string) => void;
  onError?: (error: Error) => void;
}

export class WakeWordCoordinator {
  private state: VoiceState = 'STANDBY_LISTENING';
  private vadSilenceMs: number;
  private echoCooldownMs: number;
  private maxCommandDurationMs: number;

  private vadTimer: any = null;
  private maxDurationTimer: any = null;
  private echoCooldownTimer: any = null;
  private isEchoSuppressed: boolean = false;

  private accumulatedCommand: string = '';

  private callbacks: Required<Omit<CoordinatorOptions, 'vadSilenceMs' | 'echoCooldownMs' | 'maxCommandDurationMs'>>;

  constructor(options: CoordinatorOptions = {}) {
    this.vadSilenceMs = options.vadSilenceMs ?? 1200;
    this.echoCooldownMs = options.echoCooldownMs ?? 500;
    this.maxCommandDurationMs = options.maxCommandDurationMs ?? 10000;

    this.callbacks = {
      onStateChange: options.onStateChange || (() => {}),
      onWakeDetected: options.onWakeDetected || (() => {}),
      onCommandChunk: options.onCommandChunk || (() => {}),
      onCommandReady: options.onCommandReady || (() => {}),
      onError: options.onError || (() => {})
    };
  }

  public getState(): VoiceState {
    return this.state;
  }

  private transition(newState: VoiceState): void {
    if (this.state === newState) return;
    const oldState = this.state;
    this.state = newState;
    this.callbacks.onStateChange(newState, oldState);
  }

  /**
   * Feed transcribed or recognized speech chunks into the coordinator.
   */
  public handleSpeechChunk(rawChunk: string): void {
    if (!rawChunk || typeof rawChunk !== 'string') return;
    const chunk = rawChunk.trim();
    if (!chunk) return;

    // Echo suppression guard: ignore all incoming audio while speaking or in cooldown
    if (this.state === 'SPEAKING' || this.isEchoSuppressed) {
      return;
    }

    switch (this.state) {
      case 'STANDBY_LISTENING': {
        const wakeCheck = matchWakeWord(chunk);
        if (wakeCheck.matched && wakeCheck.trigger) {
          this.transition('WAKE_DETECTED');
          this.callbacks.onWakeDetected(wakeCheck.trigger, wakeCheck.remainder);

          // If remainder command was spoken immediately in the same chunk (e.g. "Hey Mikasa what is the weather")
          if (wakeCheck.remainder && wakeCheck.remainder.trim().length > 0) {
            this.accumulatedCommand = wakeCheck.remainder.trim();
            this.callbacks.onCommandChunk(this.accumulatedCommand);
          } else {
            this.accumulatedCommand = '';
          }

          // Move into active command listening
          this.transition('COMMAND_LISTENING');
          this.startVadTimer();
        }
        break;
      }

      case 'COMMAND_LISTENING': {
        // Append chunk to command
        if (this.accumulatedCommand) {
          // If chunk already starts with accumulatedCommand or vice-versa (partial speech updates)
          if (chunk.toLowerCase().startsWith(this.accumulatedCommand.toLowerCase())) {
            this.accumulatedCommand = chunk;
          } else {
            this.accumulatedCommand += ' ' + chunk;
          }
        } else {
          this.accumulatedCommand = chunk;
        }

        this.callbacks.onCommandChunk(this.accumulatedCommand);
        // Reset VAD timer on every new speech activity
        this.resetVadTimer();
        break;
      }

      case 'PROCESSING':
      case 'SPEAKING':
        // No-op
        break;
    }
  }

  private startVadTimer(): void {
    this.clearTimers();

    // Safety timeout: max command duration
    this.maxDurationTimer = setTimeout(() => {
      this.finalizeCommand();
    }, this.maxCommandDurationMs);

    // VAD silence timer
    this.vadTimer = setTimeout(() => {
      this.finalizeCommand();
    }, this.vadSilenceMs);
  }

  private resetVadTimer(): void {
    if (this.vadTimer) clearTimeout(this.vadTimer);
    this.vadTimer = setTimeout(() => {
      this.finalizeCommand();
    }, this.vadSilenceMs);
  }

  private clearTimers(): void {
    if (this.vadTimer) {
      clearTimeout(this.vadTimer);
      this.vadTimer = null;
    }
    if (this.maxDurationTimer) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  /**
   * Finalize the recorded command and emit for processing.
   */
  public finalizeCommand(): void {
    this.clearTimers();
    if (this.state !== 'COMMAND_LISTENING') return;

    const command = this.accumulatedCommand.trim();
    this.transition('PROCESSING');

    if (command) {
      this.callbacks.onCommandReady(command);
    } else {
      // No command heard, return to standby
      this.transition('STANDBY_LISTENING');
    }
  }

  /**
   * Inform coordinator when TTS starts/stops speaking.
   */
  public setSpeaking(isSpeaking: boolean): void {
    if (isSpeaking) {
      this.isEchoSuppressed = true;
      if (this.echoCooldownTimer) clearTimeout(this.echoCooldownTimer);
      this.transition('SPEAKING');
    } else {
      // Audio playback finished: start echo cooldown before unmuting wake listener
      this.isEchoSuppressed = true;
      if (this.echoCooldownTimer) clearTimeout(this.echoCooldownTimer);

      this.echoCooldownTimer = setTimeout(() => {
        this.isEchoSuppressed = false;
        this.accumulatedCommand = '';
        this.transition('STANDBY_LISTENING');
      }, this.echoCooldownMs);
    }
  }

  /**
   * Force reset back to standby listening cleanly.
   */
  public reset(): void {
    this.clearTimers();
    if (this.echoCooldownTimer) clearTimeout(this.echoCooldownTimer);
    this.isEchoSuppressed = false;
    this.accumulatedCommand = '';
    this.transition('STANDBY_LISTENING');
  }
}

export function createWakeWordCoordinator(options: CoordinatorOptions = {}): WakeWordCoordinator {
  return new WakeWordCoordinator(options);
}

// CommonJS compatibility export for test harness
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WakeWordCoordinator,
    createWakeWordCoordinator
  };
}
