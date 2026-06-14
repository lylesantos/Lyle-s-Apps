/**
 * Procedural Audio Synthesizer utilizing Web Audio API and OfflineAudioContext.
 * Renders beautiful ambient electronic loops directly in the browser,
 * converting them to WAV Blobs to enable offline track downloads.
 */

// Helper to convert rendered AudioBuffer into a CD-quality 16-bit WAV file
export function bufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const length = numSamples * numOfChan * 2 + 44; // 16-bit = 2 bytes per sample + 44 bytes header
  const bufferArr = new ArrayBuffer(length);
  const view = new DataView(bufferArr);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // write WAV header
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8); // file length - 8
  setUint32(0x45564157); // "WAVE"

  setUint32(0x20746d66); // "fmt " sub-chunk
  setUint32(16); // sub-chunk size [16]
  setUint16(1); // PCM format [1] (Uncompressed)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // byte rate (sampleRate * blockAlign)
  setUint16(numOfChan * 2); // block align
  setUint16(16); // bits per sample [16]

  setUint32(0x61746164); // "data" sub-chunk
  setUint32(numSamples * numOfChan * 2); // chunk size

  for (i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  // write audio sample data
  while (offset < numSamples) {
    for (i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      // scale to 16-bit signed integer
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArr], { type: "audio/wav" });
}

// Procedurally generate a beautiful soundtrack based on title & mood parameters
export async function generateProceduralTrack(
  title: string,
  artist: string,
  mood: "chill" | "synthwave" | "ambient" | "beats" = "chill"
): Promise<Blob> {
  const sampleRate = 44100;
  const duration = 20; // 20-second beautiful loop
  const totalLength = sampleRate * duration;
  
  // OfflineAudioContext for extremely fast serverless background rendering
  const ctx = new OfflineAudioContext(2, totalLength, sampleRate);

  // Reverb simulation using delay nodes
  const convolver = ctx.createDelay(1.0);
  convolver.delayTime.value = 0.25;
  const convolverGain = ctx.createGain();
  convolverGain.gain.value = 0.25;

  const mainGain = ctx.createGain();
  mainGain.gain.setValueAtTime(0.01, 0);
  mainGain.gain.linearRampToValueAtTime(0.8, 1); // fade in
  mainGain.gain.setValueAtTime(0.8, duration - 1.5);
  mainGain.gain.linearRampToValueAtTime(0.01, duration); // fade out

  // Routing
  mainGain.connect(ctx.destination);
  convolver.connect(convolverGain);
  convolverGain.connect(mainGain);

  // Generate chords based on Pentatonic Scale
  const chillRoot = 220; // A3
  const noteFrequencies = {
    chill: [220, 246.94, 277.18, 329.63, 369.99, 440], // A, B, C#, E, F#, A
    synthwave: [146.83, 164.81, 196.00, 220.00, 261.63, 293.66], // D minor pentatonic
    ambient: [196.00, 220.00, 246.94, 293.66, 329.63, 392], // G, A, B, D, E, G
    beats: [130.81, 146.83, 164.81, 196.00, 220.00, 261.63] // C major/Am pentatonic
  };

  const scale = noteFrequencies[mood] || noteFrequencies.chill;

  // 1. Pad Chords (Warm base drone)
  const padOsc1 = ctx.createOscillator();
  const padOsc2 = ctx.createOscillator();
  const padFilter = ctx.createBiquadFilter();

  padOsc1.type = "sawtooth";
  padOsc2.type = "triangle";

  // Root and Fifth
  padOsc1.frequency.setValueAtTime(scale[0] / 2, 0); // bass root octave down
  padOsc2.frequency.setValueAtTime(scale[3], 0); // chord fifth

  // Detune for chorus hover drone
  padOsc1.detune.setValueAtTime(-10, 0);
  padOsc2.detune.setValueAtTime(10, 0);

  padFilter.type = "lowpass";
  if (mood === "ambient") {
    padFilter.frequency.setValueAtTime(350, 0);
    padFilter.frequency.linearRampToValueAtTime(600, duration / 2);
    padFilter.frequency.linearRampToValueAtTime(350, duration);
  } else {
    padFilter.frequency.setValueAtTime(450, 0);
    padFilter.frequency.linearRampToValueAtTime(900, duration / 2);
    padFilter.frequency.linearRampToValueAtTime(450, duration);
  }

  const padGain = ctx.createGain();
  padGain.gain.setValueAtTime(0.15, 0);

  padOsc1.connect(padFilter);
  padOsc2.connect(padFilter);
  padFilter.connect(padGain);
  padGain.connect(mainGain);
  padGain.connect(convolver);

  padOsc1.start(0);
  padOsc2.start(0);
  padOsc1.stop(duration);
  padOsc2.stop(duration);

  // 2. Melting Plucks / Arpeggiator (Beats & Melodies)
  const bpm = mood === "beats" ? 120 : mood === "synthwave" ? 110 : 85;
  const noteLength = 60 / bpm / 2; // eighth notes

  let step = 0;
  for (let time = 0.5; time < duration - 2; time += noteLength) {
    const isNoteTriggered = mood === "ambient" 
      ? Math.random() > 0.6 
      : mood === "synthwave"
        ? (step % 2 === 0 || step % 3 === 0)
        : Math.random() > 0.3;

    if (isNoteTriggered) {
      const osc = ctx.createOscillator();
      const pluckGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Pick a random note from the chord progression
      const noteMultiplier = mood === "synthwave" ? (step % 8 === 0 ? 0.5 : 1) : 1;
      const noteFreq = scale[Math.floor(Math.random() * scale.length)] * noteMultiplier;
      osc.frequency.setValueAtTime(noteFreq, time);

      if (mood === "synthwave") {
        osc.type = "sawtooth";
        filter.type = "peaking";
        filter.frequency.setValueAtTime(1200, time);
        filter.Q.setValueAtTime(4, time);
      } else if (mood === "beats") {
        osc.type = "triangle";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1500, time);
      } else {
        osc.type = "sine";
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(800, time);
      }

      pluckGain.gain.setValueAtTime(0, time);
      pluckGain.gain.linearRampToValueAtTime(mood === "synthwave" ? 0.1 : 0.18, time + 0.02);
      pluckGain.gain.exponentialRampToValueAtTime(0.001, time + (mood === "ambient" ? 0.8 : 0.35));

      osc.connect(filter);
      filter.connect(pluckGain);
      pluckGain.connect(mainGain);
      pluckGain.connect(convolver);

      osc.start(time);
      osc.stop(time + (mood === "ambient" ? 1.0 : 0.5));
    }

    // Drums simulation for upbeat tracks
    if (mood === "beats" || mood === "synthwave") {
      // 3. Kick Drum simulation (Low sine sweep) at every beat start
      if (step % 4 === 0) {
        const kickOsc = ctx.createOscillator();
        const kickGain = ctx.createGain();

        kickOsc.frequency.setValueAtTime(150, time);
        kickOsc.frequency.exponentialRampToValueAtTime(45, time + 0.09);

        kickGain.gain.setValueAtTime(0, time);
        kickGain.gain.linearRampToValueAtTime(0.6, time + 0.005);
        kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        kickOsc.connect(kickGain);
        kickGain.connect(mainGain);

        kickOsc.start(time);
        kickOsc.stop(time + 0.2);
      }

      // 4. Snare/Hi-Hat simulation (White Noise Burst / short sweep) on beat 2 & 4
      if (step % 8 === 4) {
        // Snare sweep
        const snareOsc = ctx.createOscillator();
        const snareGain = ctx.createGain();
        snareOsc.type = "triangle";
        snareOsc.frequency.setValueAtTime(180, time);
        snareOsc.frequency.exponentialRampToValueAtTime(90, time + 0.1);

        snareGain.gain.setValueAtTime(0, time);
        snareGain.gain.linearRampToValueAtTime(0.25, time + 0.01);
        snareGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

        snareOsc.connect(snareGain);
        snareGain.connect(mainGain);

        snareOsc.start(time);
        snareOsc.stop(time + 0.25);
      }
    }

    step++;
  }

  // Render the audio graph completely offline
  const renderedBuffer = await ctx.startRendering();
  
  // Encode as stereo WAV File
  return bufferToWav(renderedBuffer);
}

// Generate beautiful cover art for procedurally synthesized tracks using HTML Canvas gradients & text
export function generateProceduralCoverArt(title: string, artist: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");

  if (!ctx) return "";

  // Generate color seeds based on text hash
  let sum = 0;
  for (let i = 0; i < title.length; i++) sum += title.charCodeAt(i);
  for (let i = 0; i < artist.length; i++) sum += artist.charCodeAt(i) * 3;

  const hue1 = sum % 360;
  const hue2 = (sum + 130) % 360;
  const hue3 = (sum + 240) % 360;

  // Paint a multi-color radial mesh gradient representing Android Material concept
  const grad = ctx.createRadialGradient(200, 200, 20, 200, 200, 260);
  grad.addColorStop(0, `hsla(${hue1}, 80%, 45%, 1)`);
  grad.addColorStop(0.5, `hsla(${hue2}, 75%, 25%, 1)`);
  grad.addColorStop(1, `hsla(${hue3}, 90%, 8%, 1)`);

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 400);

  // Add trendy futuristic grid elements
  ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 400; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 400);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(400, i);
    ctx.stroke();
  }

  // Draw some modern geometry overlays
  ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
  ctx.beginPath();
  ctx.arc(200, 200, 120, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(200, 200, 80, 0, Math.PI * 2);
  ctx.stroke();

  // Highlight rings
  ctx.shadowColor = `hsla(${hue1}, 85%, 65%, 0.8)`;
  ctx.shadowBlur = 15;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(200, 200, 6, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL("image/jpeg");
}
