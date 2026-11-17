import type { Language } from '../i18n';

export type SpeechResult = 'finished' | 'cancelled' | 'unavailable';
export interface SpeechProfile { pitch?: number; rate?: number; voiceURI?: string }
interface SpeechJob {
  resolve: (result: SpeechResult) => void;
  utterance?: SpeechSynthesisUtterance;
  cancelVoiceWait?: () => void;
}
const DEFAULT_PROFILES = {
  plaintiff: { pitch: 1.12, rate: 1.02 },
  defendant: { pitch: 0.96, rate: 0.98 },
  judge: { pitch: 0.82, rate: 0.9 },
};

class SpeechManager {
  private voiceEnabled = false;
  private current: SpeechJob | null = null;

  constructor() {
    try { this.voiceEnabled = globalThis.localStorage?.getItem('court_voice_enabled') === 'true'; }
    catch { /* Voice preferences are optional when browser storage is blocked. */ }
  }

  public isSupported(): boolean {
    try { return typeof window !== 'undefined' && Boolean(window.speechSynthesis) && typeof SpeechSynthesisUtterance !== 'undefined'; }
    catch { return false; }
  }
  public getVoiceEnabled(): boolean { return this.voiceEnabled; }
  public toggleVoice(): boolean {
    this.voiceEnabled = !this.voiceEnabled;
    try { globalThis.localStorage?.setItem('court_voice_enabled', String(this.voiceEnabled)); } catch { /* Keep the in-memory setting usable. */ }
    if (!this.voiceEnabled) this.stop();
    return this.voiceEnabled;
  }

  private settle(job: SpeechJob, result: SpeechResult) {
    if (this.current !== job) return;
    this.current = null;
    job.cancelVoiceWait?.();
    if (job.utterance) { job.utterance.onend = null; job.utterance.onerror = null; }
    job.resolve(result);
  }

  public stop(): void {
    const job = this.current;
    if (job) this.settle(job, 'cancelled');
    try { if (this.isSupported()) window.speechSynthesis.cancel(); } catch { /* The cancelled promise is already settled. */ }
  }

  private async availableVoices(job: SpeechJob): Promise<SpeechSynthesisVoice[]> {
    const engine = window.speechSynthesis;
    const ready = engine.getVoices();
    if (ready.length) return ready;
    return new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { engine.removeEventListener('voiceschanged', changed); } catch { /* Optional browser event support. */ }
        job.cancelVoiceWait = undefined;
        try { resolve(engine.getVoices()); } catch { resolve([]); }
      };
      const changed = () => { try { if (engine.getVoices().length) finish(); } catch { finish(); } };
      const timer = setTimeout(finish, 700);
      job.cancelVoiceWait = finish;
      try { engine.addEventListener('voiceschanged', changed); } catch { finish(); }
      changed();
    });
  }

  public speak(rawText: string, speaker: 'plaintiff' | 'defendant' | 'judge', lang: Language, profile: SpeechProfile = {}): Promise<SpeechResult> {
    this.stop();
    if (!this.voiceEnabled || !this.isSupported()) return Promise.resolve('unavailable');
    // Read evidence labels aloud: only decorative brackets/markdown are removed.
    const cleanText = rawText.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[【】\[\]*_`#]/g, '')
      .replace(/[^\p{L}\p{N}\p{P}\s]/gu, '').trim();
    if (!cleanText) return Promise.resolve('unavailable');
    return new Promise(resolve => {
      const job: SpeechJob = { resolve };
      this.current = job;
      void (async () => {
        try {
          const voices = await this.availableVoices(job);
          if (this.current !== job) return;
          const utterance = new SpeechSynthesisUtterance(cleanText);
          job.utterance = utterance;
          // Case dialogue is authored in Simplified Chinese even when the interface is translated.
          const locale = /[\u3400-\u9fff]/.test(cleanText) ? 'zh-CN'
            : ({ zh_CN: 'zh-CN', zh_TW: 'zh-TW', en_US: 'en-US', ja_JP: 'ja-JP' }[lang]);
          utterance.lang = locale;
          const preferred = profile.voiceURI ? voices.find(voice => voice.voiceURI === profile.voiceURI) : undefined;
          const matching = voices.filter(voice => voice.lang.replace('_', '-').toLowerCase() === locale.toLowerCase());
          const available = matching.length ? matching : voices.filter(voice => voice.lang.slice(0, 2) === locale.slice(0, 2));
          const selected = preferred || available[(['plaintiff', 'defendant', 'judge'].indexOf(speaker)) % (available.length || 1)];
          if (selected) utterance.voice = selected;
          const defaults = DEFAULT_PROFILES[speaker];
          utterance.pitch = Number.isFinite(profile.pitch) ? Math.max(0, Math.min(2, profile.pitch!)) : defaults.pitch;
          utterance.rate = Number.isFinite(profile.rate) ? Math.max(0.3, Math.min(2, profile.rate!)) : defaults.rate;
          utterance.onend = () => this.settle(job, 'finished');
          utterance.onerror = event => this.settle(job, event.error === 'canceled' || event.error === 'interrupted' ? 'cancelled' : 'unavailable');
          window.speechSynthesis.speak(utterance);
        } catch { this.settle(job, 'unavailable'); }
      })();
    });
  }
}

export const speech = new SpeechManager();
