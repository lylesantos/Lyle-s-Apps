import React, { useEffect, useRef } from "react";
import { AudioEngine } from "../lib/AudioEngine";

interface VisualizerProps {
  color?: string;
  isActive: boolean;
  progress: number;
  duration: number;
  onSeek: (seconds: number) => void;
  hideVisualizer?: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({
  color = "#10b981",
  isActive,
  progress,
  duration,
  onSeek,
  hideVisualizer = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Keep references to values to avoid recreating the effect too often
  const stateRef = useRef({ isActive, progress, duration });
  useEffect(() => {
    stateRef.current = { isActive, progress, duration };
  }, [isActive, progress, duration]);

  // Premium peak and decay trackers defined correctly at the React component top-level
  const peaksRef = useRef<number[]>([]);
  const peakDecaySpeedRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Use ResizeObserver to dynamically resize the canvas
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    });

    resizeObserver.observe(container);

    const renderFrame = () => {
      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      ctx.clearRect(0, 0, w, h);

      const engine = AudioEngine.getInstance();
      const frequencies = engine.getFrequencyData();
      
      const currentState = stateRef.current;

      // 1. Sleek luxury studio background that adapts instantly to light/dark modes
      const isLight = document.documentElement.classList.contains("light");
      const bgGrd = ctx.createRadialGradient(w / 2, h / 2, h / 10, w / 2, h / 2, w * 0.7);
      if (isLight) {
        bgGrd.addColorStop(0, "rgba(248, 250, 252, 0.5)");
        bgGrd.addColorStop(1, "rgba(241, 245, 249, 0.8)");
      } else {
        bgGrd.addColorStop(0, "#0b0f19");
        bgGrd.addColorStop(1, "#020408");
      }
      ctx.fillStyle = bgGrd;
      ctx.fillRect(0, 0, w, h);

      // Extract raw audio features for visual synthesis
      let bassEnergy = 0;
      let midEnergy = 0;
      let trebleEnergy = 0;
      let averageEnergy = 0;

      if (frequencies && currentState.isActive && frequencies.length > 0) {
        // Bass calculation (first 10% of spectrum)
        const bassEnd = Math.floor(frequencies.length * 0.1);
        let bassSum = 0;
        for (let j = 0; j < bassEnd; j++) bassSum += frequencies[j];
        bassEnergy = bassSum / (bassEnd || 1) / 255;

        // Mids calculation (10% to 50%)
        const midsEnd = Math.floor(frequencies.length * 0.5);
        let midSum = 0;
        for (let j = bassEnd; j < midsEnd; j++) midSum += frequencies[j];
        midEnergy = midSum / ((midsEnd - bassEnd) || 1) / 255;

        // Treble calculation (50% to 100%)
        let trebleSum = 0;
        for (let j = midsEnd; j < frequencies.length; j++) trebleSum += frequencies[j];
        trebleEnergy = trebleSum / ((frequencies.length - midsEnd) || 1) / 255;

        averageEnergy = (bassEnergy + midEnergy + trebleEnergy) / 3;
      } else {
        // Sophisticated slow organic heartbeat patterns for realistic idle breathing
        const timeIdle = Date.now() * 0.0015;
        bassEnergy = 0.15 + Math.sin(timeIdle * 0.8) * 0.05;
        midEnergy = 0.12 + Math.cos(timeIdle * 1.1) * 0.04;
        trebleEnergy = 0.08 + Math.sin(timeIdle * 1.5) * 0.03;
        averageEnergy = (bassEnergy + midEnergy + trebleEnergy) / 3;
      }

      // 2. LAYER A: Translucent Glowing Silk Ribbons (3D-Feel Wave Fields)
      const timeMs = Date.now();
      ctx.save();
      ctx.globalCompositeOperation = "screen";

      const ribbons = [
        // Sub-Bass Wave: Deep Teal
        {
          amplitude: h * 0.22 * (0.4 + bassEnergy * 0.6),
          frequency: 0.007,
          speed: timeMs * 0.0010,
          color: "rgba(20, 184, 166, 0.18)", // Teal-500
          lineWidth: 5,
          phase: 0
        },
        // Mids Wave: Emerald Green
        {
          amplitude: h * 0.18 * (0.4 + midEnergy * 0.6),
          frequency: 0.012,
          speed: -timeMs * 0.0016,
          color: "rgba(16, 185, 129, 0.14)", // Emerald-500
          lineWidth: 3,
          phase: Math.PI / 3
        },
        // Highs Ribbon: Bright Luminous Cyan
        {
          amplitude: h * 0.14 * (0.3 + trebleEnergy * 0.7),
          frequency: 0.018,
          speed: timeMs * 0.0022,
          color: "rgba(6, 182, 212, 0.18)", // Cyan-500
          lineWidth: 2,
          phase: (Math.PI * 2) / 3
        }
      ];

      for (const rib of ribbons) {
        ctx.beginPath();
        ctx.lineWidth = rib.lineWidth;
        ctx.strokeStyle = rib.color;
        
        // Flat neon outline without shadow

        for (let x = 0; x <= w; x += 3) {
          // Add a subtle envelope to shrink the ribbon at both ends, fitting nicely in rounded boxes
          const envelope = Math.sin((x / w) * Math.PI);
          const y = (h / 2) + Math.sin(x * rib.frequency + rib.speed + rib.phase) * rib.amplitude * envelope;
          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      ctx.restore();

      // 3. LAYER B: High-Density Luminous Audio Bars with Gravity Peak Decay
      const numBars = 75;
      const barSpaceRatio = 0.35; // Space between columns
      const totalBarWidth = w / numBars;
      const dBarWidth = totalBarWidth * (1 - barSpaceRatio);
      
      // Initialize persistent peaks arrays if dimensions or channels change
      if (peaksRef.current.length !== numBars) {
        peaksRef.current = new Array(numBars).fill(0);
        peakDecaySpeedRef.current = new Array(numBars).fill(0);
      }

      const barPeaks = peaksRef.current;
      const barDecays = peakDecaySpeedRef.current;

      const gravity = 0.14; // Acceleration of peak drop
      const holdTimeFrames = 12; // Static frames before acceleration drops

      for (let i = 0; i < numBars; i++) {
        const pct = i / numBars;

        let rawVal = 0;
        if (frequencies && currentState.isActive && frequencies.length > 0) {
          // Index mapped with curved projection to favor low-mid frequencies
          const idxCurve = Math.pow(pct, 1.4);
          const freqIdx = Math.floor(idxCurve * (frequencies.length * 0.75));
          rawVal = frequencies[freqIdx] || 0;
        }

        let barHeight = 0;
        if (currentState.isActive && frequencies && frequencies.length > 0) {
          // Base envelope structure + real-time responsive multiplier
          const normFreq = rawVal / 255;
          const envelope = Math.exp(-Math.pow(pct - 0.5, 2) / 0.18); // Elegant bell contour
          barHeight = h * (normFreq * 0.72 + 0.08) * envelope * 0.95;
        } else {
          // Parametric waveform matrix to draw gorgeous moving columns when paused
          const envelope = Math.exp(-Math.pow(pct - 0.5, 2) / 0.12);
          const phaseOffset = Math.sin(Date.now() * 0.0015 + pct * Math.PI * 4.5);
          barHeight = h * (0.07 + phaseOffset * 0.04) * envelope * 2.2;
        }

        // Clamp values with graceful minimums for sleek presentation
        barHeight = Math.max(3, Math.min(barHeight, h * 0.92));

        // Physics-driven gravity peak behavior
        if (barHeight >= barPeaks[i]) {
          barPeaks[i] = barHeight;
          barDecays[i] = 0; // Reset acceleration
        } else {
          // Apply realistic gravitational acceleration
          barDecays[i] += gravity;
          barPeaks[i] -= barDecays[i];
          if (barPeaks[i] < barHeight) {
            barPeaks[i] = barHeight;
            barDecays[i] = 0;
          }
        }

        // Render Equalizer Pillars with a sophisticated layout using only teal, emerald, and cyan
        const x = i * totalBarWidth + (totalBarWidth * barSpaceRatio) / 2;
        const y = h - barHeight;

        // Strictly curated palette gradient: base Teal, middle Emerald, top Cyan
        const barGrd = ctx.createLinearGradient(0, h, 0, y);
        barGrd.addColorStop(0, "#14b8a6");   // Teal
        barGrd.addColorStop(0.5, "#10b981"); // Emerald
        barGrd.addColorStop(1, "#06b6d4");   // Cyan

        ctx.fillStyle = barGrd;
        
        ctx.beginPath();
        if (typeof ctx.roundRect === "function") {
          ctx.roundRect(x, y, dBarWidth, barHeight, 3);
        } else {
          ctx.rect(x, y, dBarWidth, barHeight);
        }
        ctx.fill();

        // Render Floating Premium Peak Indicators
        const peakY = h - barPeaks[i];
        if (peakY < h - 4) {
          // Curate high performance peak color strictly mapped inside the emerald-teal-cyan spectrum (HSL 140 to 190)
          const baseHue = 140 + (pct * 50); // Maps seamlessly from 140 (emerald) to 190 (cyan/teal)
          const peakColor = `hsl(${baseHue}, 100%, 72%)`;
          ctx.fillStyle = peakColor;
          ctx.beginPath();
          if (typeof ctx.roundRect === "function") {
            ctx.roundRect(x, peakY - 1.5, dBarWidth, 2.0, 1);
          } else {
            ctx.rect(x, peakY - 1.5, dBarWidth, 2.0);
          }
          ctx.fill();
        }
      }

      animationRef.current = requestAnimationFrame(renderFrame);
    };

    renderFrame();

    return () => {
      resizeObserver.unobserve(container);
      resizeObserver.disconnect();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [hideVisualizer]);

  const progressPct = duration > 0 ? (progress / duration) : 0;

  return (
    <div className="w-full flex flex-col space-y-3.5" id="visualizer-scrubber-stack">
      {/* 1. Real-time Waveform Visualizer Canvas */}
      {!hideVisualizer && (
        <div 
          ref={containerRef} 
          className="w-full h-14 relative overflow-hidden rounded-xl bg-slate-950/60 p-2 border border-slate-850"
          id="waveform-canvas-box"
        >
          {/* Extremely subtle progress shade highlight inside the waveform */}
          <div 
            className="absolute left-0 top-0 bottom-0 bg-emerald-500/[0.03] pointer-events-none transition-all duration-200"
            style={{ width: `${progressPct * 100}%` }}
          />

          <canvas ref={canvasRef} className="w-full h-full block opacity-95 transition-opacity" />
        </div>
      )}

      {/* 2. Obvious interactive seeker and slider component positioned below the visualizer */}
      <div 
        className="w-full relative group py-2 flex items-center select-none"
        id="interactive-seeker-bar-container"
      >
        {/* Background track line and progress fill */}
        <div className="h-2 w-full bg-slate-950 rounded-full border border-slate-900/60 relative overflow-hidden shadow-inner flex items-center">
          {/* Bright gradient progress fill matching teal -> emerald -> cyan */}
          <div 
            className="h-full bg-gradient-to-r from-teal-550 via-emerald-450 to-cyan-450 shadow-[0_0_8px_rgba(16,185,129,0.6)] transition-all duration-100 ease-out"
            style={{ width: `${progressPct * 100}%` }}
          />
        </div>

        {/* Floating Playhead Glow Selector Pin / Slider Thumb - perfectly centered on the track line */}
        <div 
          className="absolute top-1/2 w-4 h-4 rounded-full bg-slate-950 border-2 border-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.85),_inset_0_1px_2.5px_rgba(255,255,255,0.45)] flex items-center justify-center transition-all duration-150 ease-out group-hover:scale-135 group-hover:border-cyan-400 z-10 pointer-events-none"
          style={{ left: `${progressPct * 100}%`, transform: "translate(-50%, -50%)" }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 group-hover:bg-cyan-400 animate-pulse" />
        </div>

        {/* Invisible range inputs on top covering the track slider for perfect native interactions */}
        <input
          type="range"
          min="0"
          max={duration || 100}
          value={progress}
          onChange={(e) => onSeek(parseInt(e.target.value))}
          className="absolute inset-x-0 top-0 bottom-0 w-full h-full opacity-0 cursor-pointer z-20"
          title="Interactive Audio Track Progress Seeker"
        />
      </div>
    </div>
  );
};
