import React, { useState, useEffect } from "react";
import { EQSettings } from "../types";
import { AudioEngine } from "../lib/AudioEngine";
import { Sliders, Check } from "lucide-react";

interface EqualizerPanelProps {
  onEQChange?: (settings: EQSettings) => void;
}

const PRESETS: Record<string, Omit<EQSettings, "presetName">> = {
  "Flat (Neutral)": { bass: 0, mid: 0, treble: 0 },
  "Bass Booster": { bass: 8, mid: 1, treble: -2 },
  "Clear Vocals": { bass: -2, mid: 6, treble: 4 },
  "Synthwave Pulse": { bass: 5, mid: -2, treble: 6 },
  "Cozy Ambient": { bass: 3, mid: 2, treble: -4 },
};

export const EqualizerPanel: React.FC<EqualizerPanelProps> = ({ onEQChange }) => {
  const [eq, setEq] = useState<EQSettings>({
    bass: 0,
    mid: 0,
    treble: 0,
    presetName: "Flat (Neutral)",
  });

  // Apply default EQ on mount
  useEffect(() => {
    AudioEngine.getInstance().updateEQ(eq);
  }, []);

  const handleSliderChange = (band: "bass" | "mid" | "treble", value: number) => {
    const updated = {
      ...eq,
      [band]: value,
      presetName: "Custom User",
    };
    setEq(updated);
    AudioEngine.getInstance().updateEQ(updated);
    if (onEQChange) onEQChange(updated);
  };

  const handlePresetSelect = (name: string) => {
    const presetValues = PRESETS[name];
    const updated = {
      ...presetValues,
      presetName: name,
    };
    setEq(updated);
    AudioEngine.getInstance().updateEQ(updated);
    if (onEQChange) onEQChange(updated);
  };

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 backdrop-blur-md sleek-glass">
      <div className="flex items-center gap-2 mb-4">
        <Sliders className="w-5 h-5 text-emerald-450" />
        <h3 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">
          Vibe Equalizer (EQ)
        </h3>
      </div>

      {/* Preset Row */}
      <div className="mb-5">
        <label className="text-xs text-slate-400 block mb-2 font-medium">Acoustic Preset</label>
        <div className="flex flex-wrap gap-2">
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => handlePresetSelect(name)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                eq.presetName === name
                  ? "neon-accent text-slate-950 font-black shadow-md shadow-emerald-500/30"
                  : "bg-slate-800/80 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span className="flex items-center gap-1">
                {eq.presetName === name && <Check className="w-3.5 h-3.5" />}
                {name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/*EQ Sliders (Vertical design that looks like pro gear!) */}
      <div className="grid grid-cols-3 gap-6 py-2 bg-slate-950/50 rounded-xl p-4 border border-slate-900">
        {/* Bass band */}
        <div className="flex flex-col items-center">
          <label className="text-xs font-bold text-emerald-400 mb-1">BASS</label>
          <span className="text-[10px] text-slate-400 mb-2 font-mono">150Hz</span>
          <div className="h-28 relative flex justify-center pb-2">
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={eq.bass}
              onChange={(e) => handleSliderChange("bass", parseInt(e.target.value))}
              className="accent-emerald-400 cursor-pointer w-28 absolute transform -rotate-90 bottom-12"
              style={{ transformOrigin: "center" }}
            />
          </div>
          <span className="text-[11px] font-mono font-semibold text-emerald-200 mt-2">
            {eq.bass > 0 ? `+${eq.bass}` : eq.bass}dB
          </span>
        </div>

        {/* Mid band */}
        <div className="flex flex-col items-center">
          <label className="text-xs font-bold text-blue-400 mb-1">MID</label>
          <span className="text-[10px] text-slate-400 mb-2 font-mono">1.0kHz</span>
          <div className="h-28 relative flex justify-center pb-2">
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={eq.mid}
              onChange={(e) => handleSliderChange("mid", parseInt(e.target.value))}
              className="accent-blue-400 cursor-pointer w-28 absolute transform -rotate-90 bottom-12"
              style={{ transformOrigin: "center" }}
            />
          </div>
          <span className="text-[11px] font-mono font-semibold text-blue-200 mt-2">
            {eq.mid > 0 ? `+${eq.mid}` : eq.mid}dB
          </span>
        </div>

        {/* Treble band */}
        <div className="flex flex-col items-center">
          <label className="text-xs font-bold text-cyan-400 mb-1">TREBLE</label>
          <span className="text-[10px] text-slate-400 mb-2 font-mono">4.5kHz</span>
          <div className="h-28 relative flex justify-center pb-2">
            <input
              type="range"
              min="-12"
              max="12"
              step="1"
              value={eq.treble}
              onChange={(e) => handleSliderChange("treble", parseInt(e.target.value))}
              className="accent-cyan-400 cursor-pointer w-28 absolute transform -rotate-90 bottom-12"
              style={{ transformOrigin: "center" }}
            />
          </div>
          <span className="text-[11px] font-mono font-semibold text-cyan-200 mt-2">
            {eq.treble > 0 ? `+${eq.treble}` : eq.treble}dB
          </span>
        </div>
      </div>
    </div>
  );
};
