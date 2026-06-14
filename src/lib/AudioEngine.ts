import { EQSettings } from "../types";

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  public audio: HTMLAudioElement;

  private ctx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;

  // EQ BiquadFilterNodes
  private bassFilter: BiquadFilterNode | null = null;
  private midFilter: BiquadFilterNode | null = null;
  private trebleFilter: BiquadFilterNode | null = null;

  private constructor() {
    this.audio = new Audio();
    // Essential attribute to prevent CORS problems with custom media refs
    this.audio.crossOrigin = "anonymous";
  }

  public static getInstance(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
    }
    return AudioEngine.instance;
  }

  // Set up Web Audio graph upon first interaction
  public initWebAudio() {
    if (this.ctx) return; // already routed

    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtxClass();

      // Create AnalyserNode (frequency visualizer)
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;

      // Create EQ filters
      this.bassFilter = this.ctx.createBiquadFilter();
      this.bassFilter.type = "lowshelf";
      this.bassFilter.frequency.value = 250; // bass below 250Hz

      this.midFilter = this.ctx.createBiquadFilter();
      this.midFilter.type = "peaking";
      this.midFilter.Q.value = 1.0;
      this.midFilter.frequency.value = 1000; // mid band around 1kHz

      this.trebleFilter = this.ctx.createBiquadFilter();
      this.trebleFilter.type = "highshelf";
      this.trebleFilter.frequency.value = 4000; // treble above 4kHz

      // Create Gain Node for robust volume/mute control in Web Audio Graph
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.setValueAtTime(this.audio.muted ? 0 : this.audio.volume, this.ctx.currentTime);

      // Source Routing
      this.sourceNode = this.ctx.createMediaElementSource(this.audio);

      // Connect Source -> Bass -> Mid -> Treble -> Analyser -> Gain -> Output
      this.sourceNode.connect(this.bassFilter);
      this.bassFilter.connect(this.midFilter);
      this.midFilter.connect(this.trebleFilter);
      this.trebleFilter.connect(this.analyser);
      this.analyser.connect(this.gainNode);
      this.gainNode.connect(this.ctx.destination);
    } catch (error) {
      console.error("Failed to initialize Web Audio Context graph:", error);
    }
  }

  public playTrack(objectUrl: string) {
    this.initWebAudio();
    
    // Resume context if suspended
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }

    if (this.audio.src !== objectUrl) {
      this.audio.src = objectUrl;
    }
    
    this.audio.play().catch(err => {
      console.warn("Autoplay or source swap error handled:", err);
    });
  }

  public pause() {
    this.audio.pause();
  }

  public stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  public seek(seconds: number) {
    if (!isNaN(seconds) && isFinite(seconds)) {
      this.audio.currentTime = seconds;
    }
  }

  public setVolume(level: number) {
    const value = Math.max(0, Math.min(1, level));
    this.audio.volume = value;
    if (this.gainNode && this.ctx) {
      const targetVolume = this.audio.muted ? 0 : value;
      this.gainNode.gain.setValueAtTime(targetVolume, this.ctx.currentTime);
    }
  }

  public setMute(muted: boolean) {
    this.audio.muted = muted;
    if (this.gainNode && this.ctx) {
      const targetVolume = muted ? 0 : this.audio.volume;
      this.gainNode.gain.setValueAtTime(targetVolume, this.ctx.currentTime);
    }
  }

  // Equalizer adjustments
  public updateEQ(settings: EQSettings) {
    this.initWebAudio();
    
    if (this.bassFilter) {
      this.bassFilter.gain.value = settings.bass;
    }
    if (this.midFilter) {
      this.midFilter.gain.value = settings.mid;
    }
    if (this.trebleFilter) {
      this.trebleFilter.gain.value = settings.treble;
    }
  }

  // Get current frequency data array for canvas visualizers
  public getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null;
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
    return dataArray;
  }
}
