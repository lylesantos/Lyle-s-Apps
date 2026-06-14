import React, { useState, useEffect, useRef } from "react";
import { Track, PlaybackState, Playlist } from "../types";
import { Visualizer } from "./Visualizer";
import { EqualizerPanel } from "./EqualizerPanel";
import { AudioEngine } from "../lib/AudioEngine";
import { 
  Play, Pause, SkipForward, SkipBack, Shuffle, Repeat, Volume2, VolumeX, 
  Sparkles, Sliders, Music, FileText, Check, Loader2, Disc, Settings, Zap,
  Smartphone, Download
} from "lucide-react";

interface PlayerScreenProps {
  currentTrack: Track | null;
  playbackState: PlaybackState;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (seconds: number) => void;
  onVolumeChange: (level: number) => void;
  onMuteToggle: () => void;
  onShuffleToggle: () => void;
  onRepeatToggle: () => void;
  onUpdateTrackLyrics: (trackId: string, lyrics: string) => void;
  isGapless: boolean;
  onGaplessToggle: (val: boolean) => void;
  showEQ: boolean;
  setShowEQ: (val: boolean) => void;
  showLyrics: boolean;
  setShowLyrics: (val: boolean) => void;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
}

export const PlayerScreen: React.FC<PlayerScreenProps> = ({
  currentTrack,
  playbackState,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onMuteToggle,
  onShuffleToggle,
  onRepeatToggle,
  onUpdateTrackLyrics,
  isGapless,
  onGaplessToggle,
  showEQ,
  setShowEQ,
  showLyrics,
  setShowLyrics,
  showSettings,
  setShowSettings,
}) => {
  const [isGeneratingLyrics, setIsGeneratingLyrics] = useState(false);
  const [lyricsText, setLyricsText] = useState("");

  const angleRef = useRef<number>(0);
  const artworkColorsRef = useRef<string[]>([
    "#ff007f", "#7c3aed", "#0066ff", "#00f0ff", "#00ffcc", "#39ff14", "#ffe600", "#ff7e00"
  ]);
  const auraRef = useRef<HTMLDivElement | null>(null);
  const [localOnlyMode, setLocalOnlyMode] = useState<boolean>(() => {
    return localStorage.getItem("player_local_only") !== "false";
  });

  const [hideVisualizer, setHideVisualizer] = useState(() => {
    return localStorage.getItem("player_hide_visualizer") === "true";
  });
  const [showAura, setShowAura] = useState(() => {
    return localStorage.getItem("player_show_aura") !== "false";
  });

  useEffect(() => {
    localStorage.setItem("player_local_only", String(localOnlyMode));
  }, [localOnlyMode]);

  useEffect(() => {
    localStorage.setItem("player_hide_visualizer", String(hideVisualizer));
  }, [hideVisualizer]);

  useEffect(() => {
    localStorage.setItem("player_show_aura", String(showAura));
  }, [showAura]);

  // Extract or programmatically seed vibrant signature colors from the current album art or metadata
  useEffect(() => {
    if (!currentTrack) return;
    
    // Seed initial gorgeous high-vibe fallbacks so every song gets a unique color blueprint
    const seed = `${currentTrack.title} ${currentTrack.artist} ${currentTrack.album || ""}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const seededColors: string[] = [];
    const colorOffsets = [0, 72, 144, 216, 288];
    colorOffsets.forEach(offset => {
      const hue = Math.abs(hash + offset) % 360;
      seededColors.push(`hsl(${hue}, 100%, 60%)`);
    });
    
    artworkColorsRef.current = seededColors;

    // Direct pixel assessment using off-screen image decoding if CORS permits
    if (currentTrack.coverUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = currentTrack.coverUrl;
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 8;
          canvas.height = 8;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, 8, 8);
            const imgData = ctx.getImageData(0, 0, 8, 8).data;
            const extracted: string[] = [];
            
            // Sample diverse pixels from different quadrants of the cover
            const samples = [0, 4, 12, 18, 28, 34, 44, 50, 60];
            samples.forEach(index => {
              const r = imgData[index * 4];
              const g = imgData[index * 4 + 1];
              const b = imgData[index * 4 + 2];
              const a = imgData[index * 4 + 3];
              if (a > 120) {
                // Ensure sufficient color presence and inject
                extracted.push(`rgb(${r}, ${g}, ${b})`);
              }
            });
            
            if (extracted.length >= 3) {
              artworkColorsRef.current = extracted;
            }
          }
        } catch (err) {
          // Fall back gracefully to seeded HSL array with zero logs
        }
      };
    }
  }, [currentTrack]);

  useEffect(() => {
    if (currentTrack) {
      setLyricsText(currentTrack.lyrics || "");
    } else {
      setLyricsText("");
    }
  }, [currentTrack]);

  // Real-time animated spectrum aura synchronization using audio frequency beat data
  useEffect(() => {
    if (!showAura) {
      const auraElement = auraRef.current;
      if (auraElement) {
        auraElement.style.display = "none";
      }
      return;
    }

    let animId: number;
    const updateAura = () => {
      const auraElement = auraRef.current;
      if (!auraElement) {
        animId = requestAnimationFrame(updateAura);
        return;
      }

      const engine = AudioEngine.getInstance();
      const frequencies = engine.getFrequencyData();
      
      let bassIntensity = 0;
      let midIntensity = 0;
      let trebleIntensity = 0;

      if (playbackState.isPlaying && frequencies && frequencies.length > 0) {
        let bassSum = 0;
        const bassCount = Math.min(8, frequencies.length);
        for (let i = 0; i < bassCount; i++) {
          bassSum += frequencies[i];
        }
        bassIntensity = bassSum / bassCount / 255;

        let midSum = 0;
        const midStart = Math.floor(frequencies.length * 0.15);
        const midEnd = Math.floor(frequencies.length * 0.45);
        const midCount = midEnd - midStart;
        for (let i = midStart; i < midEnd; i++) {
          midSum += frequencies[i];
        }
        midIntensity = midCount > 0 ? (midSum / midCount / 255) : 0;

        let trebleSum = 0;
        const trebleStart = Math.floor(frequencies.length * 0.45);
        const trebleEnd = Math.floor(frequencies.length * 0.9);
        const trebleCount = trebleEnd - trebleStart;
        for (let i = trebleStart; i < trebleEnd; i++) {
          trebleSum += frequencies[i];
        }
        trebleIntensity = trebleCount > 0 ? (trebleSum / trebleCount / 255) : 0;
      }

      // Time variable for animation loops
      const time = Date.now() * 0.001;

      // 1. Google Gemini AI-like glow: smooth, fully organic fluid motion with neon teal, cyan, turquoise, and emerald
      const c1 = `hsl(${(182 + Math.sin(time * 0.85) * 22) % 360}, 100%, 54%)`; // Turquoise/Teal
      const c2 = `hsl(${(202 + Math.cos(time * 0.6) * 18) % 360}, 100%, 52%)`;  // Cyan/Electric Blue
      const c3 = `hsl(${(148 + Math.sin(time * 0.95) * 18) % 360}, 100%, 50%)`; // Emerald/Mint Green
      const c4 = `hsl(${(172 + Math.cos(time * 0.75) * 25) % 360}, 100%, 53%)`; // Dreamy Green-Teal

      // Blend extracted artwork colors to preserve original track aesthetic context with a subtle emerald-cyan tint
      const artColors = artworkColorsRef.current || ["#06b6d4", "#10b981", "#2dd4bf"];
      const ac1 = artColors[0] || "rgba(6, 182, 212, 0.7)";
      const ac2 = artColors[1] || ac1 || "rgba(16, 185, 129, 0.7)";

      // Construct an extremely smooth, dense linear gradient with animated range rotation
      const deg = (time * 45) % 360;
      auraElement.style.backgroundImage = `linear-gradient(${deg}deg, ${c1}, ${ac1}, ${c3}, ${ac2}, ${c2}, ${c4})`;
      auraElement.style.display = "block";

      // Apply dense, professional blur & saturation filter to emulate a physical, high-end volumetric light beam
      auraElement.style.filter = "blur(32px) saturate(1.75)";

      // 2. Extra Random Animations (Morphing Liquified Blob, Orbital Drift Wobble, and Speed Variations)
      // Pulsating beat scale is always guaranteed and reinforced
      const beatPulse = 1.0 + (bassIntensity * 0.15) + (trebleIntensity * 0.05);
      const glowSpread = 16 + (bassIntensity * 42) + (midIntensity * 18);
      const glowOpacity = 0.55 + (bassIntensity * 0.45);

      // Organic shape blob morphing: dynamically compute multi-axial border-radii
      const b1 = 45 + 15 * Math.sin(time * 1.5) + (bassIntensity * 8);
      const b2 = 55 + 15 * Math.cos(time * 1.1) - (midIntensity * 6);
      const b3 = 40 + 15 * Math.sin(time * 0.9 + 2) + (trebleIntensity * 8);
      const b4 = 60 + 15 * Math.cos(time * 1.3 + 1);
      auraElement.style.borderRadius = `${b1}% ${100-b1}% ${b2}% ${100-b2}% / ${b3}% ${b4}% ${100-b4}% ${100-b3}%`;

      // Organic coordinates translation drift (wobble orbit)
      const driftX = (Math.sin(time * 2.1) * 8 + Math.cos(time * 0.8) * 4) * (1 + midIntensity * 0.4);
      const driftY = (Math.cos(time * 1.6) * 8 + Math.sin(time * 1.1) * 4) * (1 + trebleIntensity * 0.4);

      // Rotating angle variation combining generic spin and beat-induced acceleration
      const activeAngle = (time * 25 + bassIntensity * 40) % 360;

      // Apply highly optimized transforms and dynamic multi-layered neon drop shadows
      auraElement.style.transform = `translate(${driftX}px, ${driftY}px) rotate(${activeAngle}deg) scale(${beatPulse})`;
      auraElement.style.boxShadow = `
        0 0 ${glowSpread}px ${glowSpread / 3}px ${c1}, 
        0 0 ${glowSpread * 1.8}px ${glowSpread * 0.7}px ${c2}, 
        0 0 ${glowSpread * 2.8}px ${glowSpread * 0.9}px ${c3}
      `;
      auraElement.style.opacity = `${glowOpacity}`;

      animId = requestAnimationFrame(updateAura);
    };

    updateAura();
    return () => {
      cancelAnimationFrame(animId);
    };
  }, [playbackState.isPlaying, currentTrack, showAura]);

  // Local procedural lyric generator in case of standalone deployment or offline failover
  const generateLocalProceduralLyrics = (title: string, artist: string): string => {
    const cleanTitle = title.trim();
    const cleanArtist = artist.trim();
    let totalAscii = 0;
    for (let i = 0; i < cleanTitle.length + cleanArtist.length; i++) {
      totalAscii += (cleanTitle.charCodeAt(i % cleanTitle.length) || 0) + (cleanArtist.charCodeAt(i % cleanArtist.length) || 0);
    }
    const genres = ["synthwave", "chill", "ambient", "beats"];
    const genre = genres[totalAscii % genres.length];
    let lyrics = `[00:00] (Instrumental Intro - Procedural ${genre.toUpperCase()} waves)\n\n`;
    if (genre === "synthwave") {
      lyrics += `[00:15] [VERSE 1]\nNeon beams cutting through the heavy midnight air\nCruising down the avenue of static, without a single care\nWe chase the glowing phosphorescence of your electric smile\nLet the digital oscillators carry us another mile...\n\n`;
      lyrics += `[00:35] [CHORUS]\nOh, "${cleanTitle}" is playing in the key of neon light\nWe are neon outlaws riding through the grid tonight\nWith ${cleanArtist} spinning on a cybernetic wave\nThese are the retro dreams we came to save!\n\n`;
      lyrics += `[00:55] [VERSE 2]\nSilicon highways melting under dark nostalgic skies\nAnalog dreams reflected in your dark emerald eyes\nNo clocks are ticking inside this binary dome\nJust the frequency of synth loops to guide our spirits home...\n\n`;
      lyrics += `[01:15] [CHORUS]\nOh, "${cleanTitle}" is playing in the key of neon light\nWe are neon outlaws riding through the grid tonight\nWith ${cleanArtist} spinning on a cybernetic wave\nThese are the retro dreams we came to save!\n\n`;
      lyrics += `[01:35] [OUTRO]\n(Procedural synthesizer fades into the digital horizon)\n(Thank you for playing ${cleanTitle} by ${cleanArtist})\n[01:50] (End)`;
    } else if (genre === "chill") {
      lyrics += `[00:12] [VERSE 1]\nRaindrops pattering soft against the misty screen\nSipping hot matcha tea, living in a lo-fi dream\nNo worries on our horizon, no weight upon our chest\nJust a simple steady rhythm helping us to find our rest...\n\n`;
      lyrics += `[00:32] [CHORUS]\nAnd we drift into "${cleanTitle}" so serene\nThe softest pastel colors that you have ever seen\nAs ${cleanArtist} plays a mellow acoustic loop inside\nWe find a cozy place where our anxieties can hide...\n\n`;
      lyrics += `[00:52] [VERSE 2]\nLazy clouds are billowing across the sky of slate\nTime is just a record spinning, we have no need to wait\nWe turn down all the static from the loud and crowded street\nAnd synchronize our breathing with this steady, warm, heart-beat...\n\n`;
      lyrics += `[01:12] [CHORUS]\nAnd we drift into "${cleanTitle}" so serene\nThe softest pastel colors that you have ever seen\nAs ${cleanArtist} plays a mellow acoustic loop inside\nWe find a cozy place where our anxieties can hide...\n\n`;
      lyrics += `[01:32] [OUTRO]\n(Procedural vinyl crackling and acoustic strings fade away)\n(Relax with ${cleanTitle} by ${cleanArtist} offline)\n[01:45] (End)`;
    } else if (genre === "ambient") {
      lyrics += `[00:10] [ATMOSPHERE]\n(Deep atmospheric pads resonating at 432Hz)\nFloating in a weightless celestial ocean...\n\n`;
      lyrics += `[00:25] [CHORAL DRIFT]\n"${cleanTitle}" ascends through the cosmic cloud of gas and dust\nIn the absolute center of gravity, we learn to trust\nA quiet space of stellar dust and timeless nebula gleams\n${cleanArtist} curates the carrier frequency of planetary dreams...\n\n`;
      lyrics += `[01:00] [RESONANCE]\n(Harmonic delay structures echoing across infinite deep space)\nNo words are needed where silence is a pure crystal bell\nOnly the vibrations of stellar dust to tell us all is well...\n\n`;
      lyrics += `[01:25] [CHORAL DRIFT]\n"${cleanTitle}" ascends through the cosmic cloud of gas and dust\nIn the absolute center of gravity, we learn to trust\nA quiet space of stellar dust and timeless nebula gleams\n${cleanArtist} curates the carrier frequency of planetary dreams...\n\n`;
      lyrics += `[01:50] [DECAY]\n(Cosmic solar winds blowing soft as the visual signal decays)\n(End)`;
    } else {
      lyrics += `[00:08] [VERSE 1]\nKick, snare, feel the kick, snare pumping in your soul\nTurn up the pre-amp gain, we're taking full control\nFrom the alleyways of Tokyo to Brooklyn in the rain\nWe are shifting gears, bypassing all the stress and pain...\n\n`;
      lyrics += `[00:28] [CHORUS]\nYeah, we move to the beat of "${cleanTitle}" tonight\nA classic MPC sequence making everything feel right\nWith ${cleanArtist} cutting up sample chunks for the crowd\nWe play it proud, we play it warm, and we play it loud!\n\n`;
      lyrics += `[00:48] [VERSE 2]\nSub bass rumbling underneath the concrete floor\nPeople knocking at the gates, they're begging us for more\nWe weave our stories in between the vinyl dust and scratch\nA pristine analog connection that no machine can match...\n\n`;
      lyrics += `[01:08] [CHORUS]\nYeah, we move to the beat of "${cleanTitle}" tonight\nA classic MPC sequence making everything feel right\nWith ${cleanArtist} cutting up sample chunks for the crowd\nWe play it proud, we play it warm, and we play it loud!\n\n`;
      lyrics += `[01:28] [OUTRO]\n(Low-pass filter sweeps down as the drum machine stops)\n(Infinite custom loop: ${cleanTitle} of ${cleanArtist} in high definition)\n[01:45] (End)`;
    }
    return lyrics;
  };

  // Synthesis-powered smart Lyrics writer (Supports both online API and 100% Offline fallback)
  const handleAIWriteLyrics = async () => {
    if (!currentTrack) return;

    setIsGeneratingLyrics(true);
    
    if (localOnlyMode) {
      setLyricsText("Generating stanzas procedurally on device...");
      setTimeout(() => {
        const generatedStr = generateLocalProceduralLyrics(currentTrack.title, currentTrack.artist);
        setLyricsText(generatedStr);
        onUpdateTrackLyrics(currentTrack.id, generatedStr);
        setIsGeneratingLyrics(false);
      }, 900);
      return;
    }

    setLyricsText("Drafting musical stanzas using server-side Gemini 3.5...");

    try {
      const res = await fetch("/api/generate-lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          title: currentTrack.title, 
          artist: currentTrack.artist,
          album: currentTrack.album
        }),
      });

      if (!res.ok) throw new Error("API responded with an error");

      const data = await res.json();
      const generatedStr = data.lyrics;
      setLyricsText(generatedStr);
      onUpdateTrackLyrics(currentTrack.id, generatedStr);
    } catch (err) {
      console.warn("Server connection failed or offline. Rolling back to 100% on-device dynamic generator.", err);
      const generatedStr = generateLocalProceduralLyrics(currentTrack.title, currentTrack.artist);
      setLyricsText(generatedStr);
      onUpdateTrackLyrics(currentTrack.id, generatedStr);
    } finally {
      setIsGeneratingLyrics(false);
    }
  };

  // Human Time Format Helper
  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  if (!currentTrack) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[480px] text-center space-y-4">
        <div className="relative p-6 bg-slate-900 border border-slate-800 rounded-full animate-bounce duration-1000">
          <Disc className="w-12 h-12 text-slate-700" />
        </div>
        <h2 className="text-slate-350 text-sm font-bold uppercase tracking-widest">
          No Track Is Active
        </h2>
        <p className="text-slate-500 text-xs max-w-xs leading-relaxed">
          Head over to the <span className="text-emerald-400 font-semibold">Library</span> to load local files or paste playlist URLs under the <span className="text-emerald-400 font-semibold">Importer</span>!
        </p>
      </div>
    );
  }



  return (
    <div className="max-w-xl md:max-w-2xl mx-auto bg-slate-950 border border-slate-900/80 rounded-3xl p-5 shadow-2xl relative overflow-hidden flex flex-col justify-between space-y-5 sleek-glass" id="player-screen-container">
      
      {/* Decorative ambient background filter */}
      <div 
        className="absolute inset-0 bg-cover bg-center blur-2xl opacity-10 pointer-events-none -z-10 scale-125 transition-all duration-700"
        style={{ backgroundImage: currentTrack.coverUrl ? `url(${currentTrack.coverUrl})` : "none" }}
      />

      {/* Ambient Top Margin spacer */}
      <div className="pt-1" />

      {/* Renders Slide out panels dynamically (Equalizer, Lyrics or Visualizer settings) */}
      {showEQ ? (
        <div className="animate-in fade-in slide-in-from-top duration-300">
          <EqualizerPanel />
        </div>
      ) : showLyrics ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 backdrop-blur-md sleek-glass animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-450" />
              <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
                Acoustic Lyrics
              </h3>
            </div>
            <button
              onClick={handleAIWriteLyrics}
              disabled={isGeneratingLyrics}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                isGeneratingLyrics
                  ? "neon-accent text-slate-950 font-black shadow-md shadow-emerald-500/30"
                  : "bg-slate-800/80 text-emerald-400 hover:bg-slate-800"
              }`}
            >
              {isGeneratingLyrics ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{isGeneratingLyrics ? "Drafting..." : "AI Lyric Draft"}</span>
            </button>
          </div>

          <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-900 min-h-[150px] max-h-[220px] overflow-y-auto custom-scrollbar">
            <div className="text-center text-xs leading-relaxed font-mono whitespace-pre-wrap text-slate-350 select-text">
              {lyricsText || (
                <div className="flex flex-col items-center justify-center py-8 text-slate-500 space-y-3 font-sans">
                  <Music className="w-8 h-8 text-slate-700 animate-pulse" />
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-400">No lyrics compiled offline</p>
                    <p className="text-[10px] text-slate-600 italic">Hit 'AI Lyric Draft' to transcribe dynamically!</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : showSettings ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 backdrop-blur-md sleek-glass animate-in fade-in slide-in-from-top duration-300">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-emerald-450" />
              <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
                Display & Playback Settings
              </h3>
            </div>
            <span className="text-[9px] font-mono font-bold text-emerald-500 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-full tracking-wider">
              PRO ENGINE
            </span>
          </div>

          <div className="space-y-3 bg-slate-950/50 rounded-xl p-4 border border-slate-900">
            {/* Setting Item 1: Realtime Visualizer */}
            <div className="flex items-center justify-between py-1.5 border-b border-slate-900/40 pb-3">
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-200">Realtime Spectrum Waves</span>
                <span className="text-[9px] font-mono font-medium text-slate-500 uppercase mt-0.5">Waveform Visualizer</span>
              </div>
              <button
                type="button"
                onClick={() => setHideVisualizer(!hideVisualizer)}
                className={`w-11 h-6 rounded-full p-0.5 transition-all duration-300 ease-out flex items-center cursor-pointer outline-none relative select-none ${
                  !hideVisualizer
                    ? "bg-emerald-500 shadow-md shadow-emerald-500/30"
                    : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full transition-all duration-300 ease-out ${
                    !hideVisualizer
                      ? "translate-x-5 bg-white scale-110 shadow-sm"
                      : "translate-x-0 bg-slate-400"
                  }`}
                />
              </button>
            </div>

            {/* Setting Item 2: Gapless Playback */}
            <div className="flex items-center justify-between py-1.5 border-b border-slate-900/40 py-3">
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-200">Continuous Sound Bridges</span>
                <span className="text-[9px] font-mono font-medium text-slate-500 uppercase mt-0.5">Gapless Playback</span>
              </div>
              <button
                type="button"
                onClick={() => onGaplessToggle(!isGapless)}
                className={`w-11 h-6 rounded-full p-0.5 transition-all duration-300 ease-out flex items-center cursor-pointer outline-none relative select-none ${
                  isGapless
                    ? "bg-emerald-500 shadow-md shadow-emerald-500/30"
                    : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full transition-all duration-300 ease-out ${
                    isGapless
                      ? "translate-x-5 bg-white scale-110 shadow-sm"
                      : "translate-x-0 bg-slate-400"
                  }`}
                />
              </button>
            </div>

            {/* Setting Item 3: Spectrum Aura Glow */}
            <div className="flex items-center justify-between py-1.5 pt-2 border-b border-slate-900/40 pb-3">
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-slate-200">Dynamic Aura Envelope</span>
                <span className="text-[9px] font-mono font-medium text-slate-500 uppercase mt-0.5">Chroma Ambient Glow</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAura(!showAura)}
                className={`w-11 h-6 rounded-full p-0.5 transition-all duration-300 ease-out flex items-center cursor-pointer outline-none relative select-none ${
                  showAura
                    ? "bg-emerald-500 shadow-md shadow-emerald-500/30"
                    : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full transition-all duration-300 ease-out ${
                    showAura
                      ? "translate-x-5 bg-white scale-110 shadow-sm"
                      : "translate-x-0 bg-slate-400"
                  }`}
                />
              </button>
            </div>

            {/* Setting Item 4: 100% On-Device Standalone Mode */}
            <div className="flex items-center justify-between py-1.5 pt-2 border-b border-slate-900/40 pb-3">
              <div className="flex flex-col text-left">
                <span className="text-[11px] font-bold text-emerald-400">100% On-Device Player</span>
                <span className="text-[9px] font-mono font-medium text-slate-500 uppercase mt-0.5">Offline Standalone Mode</span>
              </div>
              <button
                type="button"
                onClick={() => setLocalOnlyMode(!localOnlyMode)}
                className={`w-11 h-6 rounded-full p-0.5 transition-all duration-300 ease-out flex items-center cursor-pointer outline-none relative select-none ${
                  localOnlyMode
                    ? "bg-emerald-500 shadow-md shadow-emerald-500/30"
                    : "bg-slate-800"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full transition-all duration-300 ease-out ${
                    localOnlyMode
                      ? "translate-x-5 bg-white scale-110 shadow-sm"
                      : "translate-x-0 bg-slate-400"
                  }`}
                />
              </button>
            </div>

            {/* Setting Item 5: Unified Android Native & PWA Deployment Station */}
            <div className="pt-3.5 space-y-3 text-left">
              <div className="flex items-center gap-1.5 pb-0.5">
                <Smartphone className="w-4 h-4 text-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Android & PWA Deployment Station</span>
              </div>
              
              <div className="p-3 bg-slate-950/80 border border-slate-900 rounded-2xl space-y-3.5 text-[10.5px] leading-relaxed">
                
                {/* Android Native Setup */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold text-[9px] font-mono select-none">APK</div>
                    <p className="font-bold text-slate-200">Native Android App (Capacitor)</p>
                  </div>
                  <p className="text-slate-400 text-[10px]">
                    Capacitor is fully integrated into this repository. You can generate a native installable APK to distribute on GitHub or install on your device:
                  </p>
                  
                  <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-900 font-mono text-[9px] text-slate-400 select-all space-y-1 overflow-x-auto leading-normal">
                    <p className="text-emerald-500 font-bold"># 1. Sync React builds to the native Android project</p>
                    <p className="text-slate-350">npm run build && npx cap sync</p>
                    
                    <p className="text-emerald-500 font-bold mt-2"># 2. Build the production debug APK locally</p>
                    <p className="text-slate-350">cd android && ./gradlew assembleDebug</p>
                    
                    <p className="text-emerald-500 font-bold mt-2"># 3. Alternatively, open in Android Studio to key-sign your release build</p>
                    <p className="text-slate-350">npx cap open android</p>
                  </div>
                  
                  <p className="text-slate-500 text-[9.5px]">
                    The compiled `.apk` file will reside in <code className="text-slate-300 font-mono">android/app/build/outputs/apk/debug/app-debug.apk</code>, ready to upload as a GitHub Release!
                  </p>
                </div>

                <div className="border-t border-slate-900 my-1"></div>

                {/* Webhosting & PWA Setup */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold text-[9px] font-mono select-none">PWA</div>
                    <p className="font-bold text-slate-200">Web Hosting Deployment</p>
                  </div>
                  <p className="text-slate-400 text-[10px]">
                    Deploy this as a high-performance installer app on any free/paid static web hosting:
                  </p>
                  
                  <div className="bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/50 space-y-1">
                    <p className="font-bold text-[9px] text-slate-300">UPLOAD GUIDE:</p>
                    <p className="text-slate-400 text-[9.5px]">
                      1. Upload everything inside the compiled <code className="text-slate-200 font-mono">/dist</code> directory directly into your server root or FTP public folder (e.g. Hostinger, cPanel, Netlify, or GitHub Pages).
                    </p>
                    <p className="text-slate-400 text-[9.5px]">
                      2. Users loading your URL on Android/iOS can immediately choose <span className="text-emerald-400 font-bold">"Add to Home Screen"</span> to launch VibePlayer in sleek, borderless, zero-browser-frame mobile view!
                    </p>
                  </div>
                </div>

              </div>
            </div>

          </div>
        </div>
      ) : (
        /* Plain Beautiful Centered Album Art Cover */
        <div className="flex flex-col items-center justify-center py-6 relative group w-full animate-in fade-in zoom-in duration-500" id="plain-album-container">
          {/* Animated Spectrum Aura Border Sleeve */}
          {showAura && (
            <div 
              ref={auraRef}
              className="absolute rounded-[32px] transition-all duration-75 ease-out -z-10 w-[272px] h-[272px] sm:w-[336px] sm:h-[336px] md:w-[400px] md:h-[400px]"
              style={{
                opacity: 0.85,
                willChange: "transform, box-shadow, opacity",
              }}
            />
          )}
          <div className="relative w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-3xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-900 group/cover transition-all duration-500 hover:scale-[1.02] flex-shrink-0">
            {currentTrack.coverUrl ? (
              <img
                src={currentTrack.coverUrl}
                alt="album artwork"
                className="w-full h-full object-cover transition-transform duration-700 group-hover/cover:scale-105"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-950 text-slate-500">
                <Music className="w-14 h-14 text-slate-700 mb-2" />
                <span className="text-[10px] font-mono text-slate-600 uppercase">NO ARTWORK</span>
              </div>
            )}
            {/* Glossy overlay sheen */}
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none" />
            <div className="absolute bottom-2 left-2 right-2 px-2.5 py-1.5 rounded-lg bg-slate-950/80 backdrop-blur-md border border-slate-800/45 text-left opacity-0 group-hover/cover:opacity-100 transition-opacity duration-300">
              <p className="text-[9px] font-bold text-slate-200 uppercase tracking-wider truncate">Album Sleeve</p>
              <p className="text-[8px] font-mono text-emerald-450 truncate">{currentTrack.album || "Unknown Album"}</p>
            </div>
          </div>
        </div>
      )}

      {/* Title & Artist Block */}
      <div className="text-center space-y-1">
        <h2 className="text-base font-extrabold text-slate-100 truncate max-w-xs mx-auto">
          {currentTrack.title}
        </h2>
        <p className="text-xs font-semibold text-slate-300 truncate max-w-xs mx-auto">
          {currentTrack.artist} • <span className="text-emerald-450 font-medium">{currentTrack.album}</span>
        </p>
      </div>

      {/* Integrated Seekable Audio Waveform Visualizer */}
      <div className="space-y-1.5 py-1">
        <Visualizer 
          color="#10b981" 
          isActive={playbackState.isPlaying} 
          progress={playbackState.progress}
          duration={currentTrack.duration}
          onSeek={onSeek}
          hideVisualizer={hideVisualizer}
        />
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 px-1">
          <span>{formatTime(playbackState.progress)}</span>
          <span>{formatTime(currentTrack.duration)}</span>
        </div>
      </div>

      {/* Center Console playback adjustments (Controls block) */}
      <div className="flex items-center justify-between py-1 bg-slate-900/40 p-4 rounded-2xl border border-slate-900/70 shadow-inner sleek-glass">
        {/* Shuffle */}
        <button
          onClick={onShuffleToggle}
          className={`p-2 rounded-lg transition-all cursor-pointer ${
            playbackState.isShuffle ? "text-emerald-400 scale-105" : "text-slate-600 hover:text-slate-400"
          }`}
          title="Shuffle Queue"
        >
          <Shuffle className="w-4 h-4" />
        </button>

        {/* Skip Backward */}
        <button 
          onClick={onPrev}
          className="p-2 text-slate-350 hover:text-white transition-all cursor-pointer"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        {/* Play / Pause (FAB-sized active circle with neon gradient) */}
        <button
          onClick={onTogglePlay}
          className="p-4.5 neon-accent text-white rounded-full shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer transform hover:scale-105 border border-white/10"
        >
          {playbackState.isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current translate-x-0.5" />
          )}
        </button>

        {/* Skip Forward */}
        <button 
          onClick={onNext}
          className="p-2 text-slate-350 hover:text-white transition-all cursor-pointer"
        >
          <SkipForward className="w-5 h-5" />
        </button>

        {/* Repeat */}
        <button
          onClick={onRepeatToggle}
          className={`p-2 rounded-lg relative transition-all cursor-pointer ${
            playbackState.isRepeat !== "none" ? "text-emerald-400 scale-105" : "text-slate-600 hover:text-slate-400"
          }`}
          title="Repeat Settings"
        >
          <Repeat className="w-4 h-4" />
          {playbackState.isRepeat === "one" && (
            <span className="absolute -top-1 -right-1 bg-emerald-500 text-slate-950 text-[7px] font-black w-3.5 h-3.5 rounded-full flex items-center justify-center">
              1
            </span>
          )}
        </button>
      </div>

      {/* Volume / Queue Bottom bar */}
      <div className="flex items-center justify-between gap-4 py-1 text-xs text-slate-400 select-none">
        
        {/* Audio Mute controls */}
        <div className="flex items-center gap-2 flex-1">
          <button 
            onClick={onMuteToggle}
            className="text-slate-500 hover:text-slate-350 cursor-pointer"
          >
            {playbackState.isMuted || playbackState.volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-500 animate-pulse" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={playbackState.isMuted ? 0 : playbackState.volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-20 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 h-1 flex-1"
          />
        </div>
      </div>
    </div>
  );
};
