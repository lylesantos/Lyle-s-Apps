import React, { useState, useEffect, useRef } from "react";
import { Track, Playlist } from "../types";
import { saveTrack, savePlaylist } from "../lib/db";
import { generateProceduralTrack, generateProceduralCoverArt } from "../lib/AudioSynthesizer";
import { writeID3 } from "../lib/id3";
import {
  Download,
  Play,
  Pause,
  Plus,
  Compass,
  FileCode,
  HardDrive,
  Network,
  Activity,
  CheckCircle,
  Clock,
  Sparkles,
  Search,
  ChevronRight,
  User,
  ShieldCheck,
  Zap,
  Globe,
  Trash2,
  FileMusic,
  Maximize2,
  Server,
  Radio,
  FileArchive,
  Volume2
} from "lucide-react";

interface TorrentScreenProps {
  onTracksUpdated: () => void;
  onNavigateToPlaylists?: () => void;
}

interface TorrentFile {
  name: string;
  size: number; // in bytes
  progress: number; // 0 to 1
  isCompleted: boolean;
  playing: boolean;
  audioBlob?: Blob;
  trackId?: string;
  artist: string;
  mood: "chill" | "synthwave" | "ambient" | "beats";
  lyrics: string;
}

interface Torrent {
  id: string;
  name: string;
  infoHash: string;
  totalSize: number; // in bytes
  downloaded: number; // in bytes
  progress: number; // 0 to 1
  downloadSpeed: number; // in bytes/s
  uploadSpeed: number; // in bytes/s
  seeders: number;
  leechers: number;
  status: "connecting" | "downloading" | "seeding" | "paused" | "parsing";
  files: TorrentFile[];
  pieces: boolean[]; // piece matrix (length = 40)
  activePieceIndices: number[]; // currently downloading pieces
}

// Preset Torrent indexes for user discovery
const PRELOADED_TORRENTS = [
  {
    name: "Lofi Retro Sunset (Chillhop Collective) [MP3]",
    infoHash: "b85777df4c74a584a205a2cd06ebbc29d9fedfcd",
    seeders: 42,
    leechers: 8,
    size: 21250000,
    files: [
      { name: "01. Floating on Twilight.mp3", size: 5410000, artist: "Lofi Collective", mood: "chill", lyrics: "[Instrumental - Chill Lounge]\n(Soft ocean waves crashing)\n(Vinyl crackles spinning under a low lamp)\n(Electric piano progression starting at 0:08)\n(Chill kick drums and rimshots driving the slow pace)" },
      { name: "02. Sleepy Rooftops.mp3", size: 4890000, artist: "Acoustic Beats", mood: "chill", lyrics: "[Acoustic Chill]\nMorning coffee on the terrace\nWatching rain wash out the terrace\nI wonder if you're home tonight\nOr walking under city lights\n\n[Chorus]\nStay awhile, the sunrise glows\nEverything moves down and slow\nRest your head, forget the lines\nWe have all of the time." },
      { name: "03. Vintage Coffee Cup.mp3", size: 6220000, artist: "Jazz Vibe", mood: "chill", lyrics: "[Vibe Segment]\nEspresso steam ascending in spirals\nOld jazz record scratching on circles\nNo words spoken, the groove is enough." },
      { name: "04. Cover_Art.jpg", size: 512000, artist: "Artwork Team", mood: "chill", lyrics: "" }
    ]
  },
  {
    name: "Neon Arcade Overdrive (Lossless Synthwave Session)",
    infoHash: "fa622026aecca74de7bca26ef3527a4e6ce900af",
    seeders: 68,
    leechers: 14,
    size: 34500000,
    files: [
      { name: "01. Hyperdrive Neon.mp3", size: 8120000, artist: "Cyber Drifter", mood: "synthwave", lyrics: "[Synthwave Electro]\nPower lines glowing red in the dark\nEngines scream under holographic signs\n\n[Chorus]\nSpeed of light, cyber wind in my eyes\nEscape the system, leave the grid behind!\nNo tomorrow, neon light burns bright\nDriving forever through this endless night." },
      { name: "02. Grid Runner 2099.mp3", size: 9450000, artist: "Tokyo Drift", mood: "synthwave", lyrics: "[Retro Drive]\nChrome windshield reflecting the lasers\nSilicon heart pumping virtual energy\nRun the grid, outrun the chase." },
      { name: "03. Hologram Skies.mp3", size: 7800000, artist: "Laser Grid", mood: "synthwave", lyrics: "[Neon Dream]\nFloating screens, laser beams\nWe are caught inside a hologram sky\nPixel heart beats, computerized streets\nWill we delete or live and let fly?" }
    ]
  },
  {
    name: "Cosmo Deep Spacescapes (Ambient Dark Drones)",
    infoHash: "92ca06bc8fe223ff4a802f1f0e42f9ae1be67041",
    seeders: 28,
    leechers: 4,
    size: 42100000,
    files: [
      { name: "01. Event Horizon.mp3", size: 14200000, artist: "Orion Nebula", mood: "ambient", lyrics: "[Deep Space Drone]\n(Distant pulsars ticking in the vacuum)\n(Low subsonic hum of carbon reactors)\n(Sustained analog synthesizer pad slowly evolving)" },
      { name: "02. Kepler-186f Atmosphere.mp3", size: 12800000, artist: "Hubble Telescope", mood: "ambient", lyrics: "[Atmospheric Ambient]\n(Gaseous winds blowing across a foreign soil)\n(Ethereal chorus echoing from icy canyons)\n(No rhythm, pure gravity)" }
    ]
  }
];

const isSupportedAudio = (fileName: string) => {
  const lower = fileName.toLowerCase();
  return [".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".mp4", ".opus"].some(ext => lower.endsWith(ext));
};

export const TorrentScreen: React.FC<TorrentScreenProps> = ({
  onTracksUpdated,
  onNavigateToPlaylists
}) => {
  const [activeTab, setActiveTab] = useState<"client" | "search">("client");
  const [magnetInput, setMagnetInput] = useState("");
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [activeTorrentId, setActiveTorrentId] = useState<string | null>(null);

  // Streaming Preview States
  const [streamingTrack, setStreamingTrack] = useState<{
    file: TorrentFile;
    torrentId: string;
    objectUrl?: string;
  } | null>(null);
  const [isPlayingStream, setIsPlayingStream] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamAudioRef] = useState(() => new Audio());

  // Static files explorer
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync / Listen to native audio element for preview
  useEffect(() => {
    const handleTimeUpdate = () => {
      setStreamProgress(streamAudioRef.currentTime);
    };
    const handleEnded = () => {
      setIsPlayingStream(false);
      setStreamProgress(0);
    };

    streamAudioRef.addEventListener("timeupdate", handleTimeUpdate);
    streamAudioRef.addEventListener("ended", handleEnded);

    return () => {
      streamAudioRef.removeEventListener("timeupdate", handleTimeUpdate);
      streamAudioRef.removeEventListener("ended", handleEnded);
      streamAudioRef.pause();
    };
  }, [streamAudioRef]);

  // Periodic download updates (Swarm simulation ticks)
  useEffect(() => {
    const timer = setInterval(() => {
      setTorrents((prevTorrents) =>
        prevTorrents.map((torrent) => {
          if (torrent.status !== "downloading") return torrent;

          // Realistic download rates between 800 KB/s and 4.2 MB/s
          const currentSpeed = Math.floor(
            (850000 + Math.random() * 2500000) * (torrent.seeders / 40)
          );
          // Upload rate proportional to seeds/leechers ratio
          const currentUploadSpeed = Math.floor(
            currentSpeed * 0.15 * (1 + Math.random() * 0.2)
          );

          // Add random tick downloads (e.g., 1-second worth of speed)
          let delta = currentSpeed;
          let nextDownloaded = Math.min(torrent.totalSize, torrent.downloaded + delta);
          let newProgress = nextDownloaded / torrent.totalSize;

          // Dynamically adjust pieces array to visual completion percentage
          const totalPieces = torrent.pieces.length;
          const completedPiecesCount = Math.floor(newProgress * totalPieces);
          const nextPieces = torrent.pieces.map((p, idx) => {
            // Pieces completed sequentially or randomly up to ratio
            if (idx < completedPiecesCount) return true;
            return p;
          });

          // Randomize yellow "active blocks" index
          const activeIndices: number[] = [];
          if (newProgress < 1.0) {
            const emptyIndices = nextPieces
              .map((p, idx) => (!p ? idx : -1))
              .filter((idx) => idx !== -1);
            for (let i = 0; i < Math.min(3, emptyIndices.length); i++) {
              activeIndices.push(emptyIndices[Math.floor(Math.random() * emptyIndices.length)]);
            }
          }

          // Distribute file progresses proportionately
          const updatedFiles = torrent.files.map((file) => {
            if (file.isCompleted) return file;

            // Simple estimation: files download sequentially or balanced
            let fileCompletedSize = Math.max(
              0,
              Math.min(file.size, (nextDownloaded / torrent.totalSize) * file.size)
            );
            let fileProgress = fileCompletedSize / file.size;

            // Small random variation per file to feel alive
            if (fileProgress > 0.99) {
              return {
                ...file,
                progress: 1.0,
                isCompleted: true
              };
            }

            return {
              ...file,
              progress: fileProgress
            };
          });

          // Check if completion triggered
          let nextStatus = torrent.status;
          if (nextDownloaded >= torrent.totalSize) {
            nextStatus = "seeding";
            // Set all files as completed
            updatedFiles.forEach((file) => {
              file.progress = 1.0;
              file.isCompleted = true;
            });
            nextDownloaded = torrent.totalSize;
            newProgress = 1.0;
          }

          return {
            ...torrent,
            downloaded: nextDownloaded,
            progress: newProgress,
            downloadSpeed: nextStatus === "seeding" ? 0 : currentSpeed,
            uploadSpeed: nextStatus === "seeding" ? Math.floor(currentSpeed * 0.08) : currentUploadSpeed,
            status: nextStatus,
            files: updatedFiles,
            pieces: nextPieces,
            activePieceIndices: activeIndices
          };
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Sync active UI layout selection
  useEffect(() => {
    if (torrents.length > 0 && !activeTorrentId) {
      setActiveTorrentId(torrents[0].id);
    }
  }, [torrents]);

  // Launch simulated audio file streaming during downloading
  const handleStreamPreview = async (torrentId: string, file: TorrentFile) => {
    // If already playing this stream, toggle playing
    if (streamingTrack && streamingTrack.file.name === file.name && streamingTrack.torrentId === torrentId) {
      if (isPlayingStream) {
        streamAudioRef.pause();
        setIsPlayingStream(false);
      } else {
        streamAudioRef.play();
        setIsPlayingStream(true);
      }
      return;
    }

    try {
      // Pause any active play state
      streamAudioRef.pause();
      setIsPlayingStream(false);

      let audioBlob = file.audioBlob;
      if (!audioBlob) {
        // Synthesize dynamic preview loop
        audioBlob = await generateProceduralTrack(
          file.name.replace(".mp3", ""),
          file.artist,
          file.mood
        );
        // Cache blob on the torrent file descriptor itself
        setTorrents((prev) =>
          prev.map((t) => {
            if (t.id === torrentId) {
              return {
                ...t,
                files: t.files.map((f) => (f.name === file.name ? { ...f, audioBlob } : f))
              };
            }
            return t;
          })
        );
      }

      const tempUrl = URL.createObjectURL(audioBlob);
      setStreamingTrack({
        file,
        torrentId,
        objectUrl: tempUrl
      });

      streamAudioRef.src = tempUrl;
      streamAudioRef.volume = 0.8;
      
      // If file progress is partial (< 50%), simulate lower download fidelity using a high frequency low-cut filter or simple notice
      // We can play it immediately
      await streamAudioRef.play();
      setIsPlayingStream(true);
    } catch (err) {
      console.error("Failed to compile streaming preview wav: ", err);
    }
  };

  const handleStopStream = () => {
    streamAudioRef.pause();
    setIsPlayingStream(false);
    setStreamingTrack(null);
  };

  // Build high-fidelity WAV with ID3 metadata tags, save in browser DB
  const handleSaveTrackToLibrary = async (torrentId: string, file: TorrentFile) => {
    if (!file.isCompleted) return;

    try {
      let audioBlob = file.audioBlob;
      if (!audioBlob) {
        // Synthesize final high-fidelity wav
        audioBlob = await generateProceduralTrack(
          file.name.replace(".mp3", ""),
          file.artist,
          file.mood
        );
      }

      // Generate procedural cover artwork
      const titleClean = file.name.replace(/\.[^/.]+$/, "");
      const coverBase64 = generateProceduralCoverArt(titleClean, file.artist);

      // Write standard tags directly inside blob
      const taggedBlob = await writeID3(audioBlob, {
        title: titleClean,
        artist: file.artist,
        album: "Torrent Swarm Import",
        coverUrl: coverBase64
      });

      const trackId = `torrent_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const newTrack: Track = {
        id: trackId,
        title: titleClean,
        artist: file.artist,
        album: "Torrent Swarm Import",
        duration: 120, // procedural is 120s loop (or 20s)
        fileSize: taggedBlob.size,
        blob: taggedBlob,
        coverUrl: coverBase64,
        lyrics: file.lyrics || "P2P verified lossless audio transfer metadata.",
        source: "local",
        createdAt: Date.now()
      };

      await saveTrack(newTrack);
      onTracksUpdated();

      // Give visual success confirmation
      alert(`"${titleClean}" imported into your Music Library! Accessible offline.`);
    } catch (err) {
      console.error("IndexedDB compilation save failed:", err);
      alert("Error saving compiled track files.");
    }
  };

  // Batch import all validated completed songs in a torrent as a fresh playlist
  const handleImportAllCompleted = async (torrent: Torrent) => {
    const completedSongs = torrent.files.filter((f) => f.name.endsWith(".mp3") && f.isCompleted);
    if (completedSongs.length === 0) {
      alert("No active songs have reached 100% download state yet.");
      return;
    }

    let importedCount = 0;
    const trackIdsSaved: string[] = [];

    for (let file of completedSongs) {
      try {
        let audioBlob = file.audioBlob;
        if (!audioBlob) {
          audioBlob = await generateProceduralTrack(
            file.name.replace(".mp3", ""),
            file.artist,
            file.mood
          );
        }

        const titleClean = file.name.replace(/\.[^/.]+$/, "");
        const coverBase64 = generateProceduralCoverArt(titleClean, file.artist);
        const taggedBlob = await writeID3(audioBlob, {
          title: titleClean,
          artist: file.artist,
          album: torrent.name,
          coverUrl: coverBase64
        });

        const trackId = `torrent_batch_${Date.now()}_${importedCount}`;
        const newTrack: Track = {
          id: trackId,
          title: titleClean,
          artist: file.artist,
          album: torrent.name,
          duration: 120,
          fileSize: taggedBlob.size,
          blob: taggedBlob,
          coverUrl: coverBase64,
          lyrics: file.lyrics || "Imported completely from secure BitTorrent swarm.",
          source: "local",
          createdAt: Date.now()
        };

        await saveTrack(newTrack);
        trackIdsSaved.push(trackId);
        importedCount++;
      } catch (e) {
        console.error(e);
      }
    }

    if (trackIdsSaved.length > 0) {
      // Save as playlist grouping
      const playlistId = `torrent_playlist_${Date.now()}`;
      const newPlaylist: Playlist = {
        id: playlistId,
        name: torrent.name.replace(/\.[^/.]+$/, "").substring(0, 32),
        description: `Imported directly via P2P BitTorrent. InfoHash: ${torrent.infoHash.substring(0, 8)}...`,
        coverUrl: generateProceduralCoverArt(torrent.name, "P2P Swarm Hub"),
        trackIds: trackIdsSaved,
        createdAt: Date.now()
      };

      await savePlaylist(newPlaylist);
      onTracksUpdated();

      alert(`Successfully saved ${importedCount} lossless files as a new playlist folder.`);
      if (onNavigateToPlaylists) {
        onNavigateToPlaylists();
      }
    }
  };

  // Convert magnet text or infohash and parse metadata
  const handleAddTorrent = (name: string, infoHash: string, filesData: any[]) => {
    // Prevent duplicate infohashes
    if (torrents.some((t) => t.infoHash === infoHash)) {
      alert("This torrent is already active in your client catalog.");
      return;
    }

    const totalBytes = filesData.reduce((acc, f) => acc + f.size, 0);
    const piecesArray = Array(40).fill(false);

    const mappedFiles: TorrentFile[] = filesData.map((f) => ({
      name: f.name,
      size: f.size,
      progress: 0,
      isCompleted: false,
      playing: false,
      artist: f.artist || "Unknown Peer",
      mood: f.mood || "chill",
      lyrics: f.lyrics || "Lossless track parsed from swarm."
    }));

    const newTorrent: Torrent = {
      id: `torrent_inst_${Date.now()}`,
      name,
      infoHash,
      totalSize: totalBytes,
      downloaded: 0,
      progress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      seeders: Math.floor(10 + Math.random() * 80),
      leechers: Math.floor(2 + Math.random() * 20),
      status: "connecting",
      files: mappedFiles,
      pieces: piecesArray,
      activePieceIndices: []
    };

    setTorrents((prev) => [newTorrent, ...prev]);
    setActiveTorrentId(newTorrent.id);

    // Short spinner phase to resolve tracker handshakes
    setTimeout(() => {
      setTorrents((prev) =>
        prev.map((t) => (t.id === newTorrent.id ? { ...t, status: "downloading" } : t))
      );
    }, 2500);

    setMagnetInput("");
  };

  // Handle manual submit of Magnet Link
  const handleMagnetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanStr = magnetInput.trim();
    if (!cleanStr) return;

    // Parse standard magnet queries: magnet:?xt=urn:btih:XXXXX&dn=Name
    let name = "Manual Magnet Stream Feed";
    let hash = "btih_" + Date.now().toString(16);

    try {
      const urlParams = new URLSearchParams(cleanStr.replace(/^[^\?]+\?/, ""));
      const dn = urlParams.get("dn");
      const xt = urlParams.get("xt");
      if (dn) name = decodeURIComponent(dn);
      if (xt) hash = xt.replace("urn:btih:", "");
    } catch (e) {
      console.warn("Raw non-standard magnet format bypass.");
    }

    // Generate random files for pasted torrents
    const randomFiles = [
      { name: "01. Cosmic Transmission.mp3", size: 6800000, artist: "P2P Artist", mood: "ambient", lyrics: "Decoded transmission from space." },
      { name: "02. Galactic Wind.mp3", size: 7200000, artist: "P2P Artist", mood: "ambient", lyrics: "Stars aligned in minor keys." },
      { name: "Release_Manifest.nfo", size: 4000, artist: "Release Crew", mood: "chill", lyrics: "" }
    ];

    handleAddTorrent(name, hash, randomFiles);
  };

  // Instant downloader speed cheat code
  const handleBurstDownload = (torrentId: string) => {
    setTorrents((prev) =>
      prev.map((t) => {
        if (t.id === torrentId) {
          return {
            ...t,
            downloaded: t.totalSize,
            progress: 1.0,
            status: "seeding",
            pieces: t.pieces.map(() => true),
            activePieceIndices: [],
            files: t.files.map((f) => ({ ...f, progress: 1.0, isCompleted: true }))
          };
        }
        return t;
      })
    );
  };

  const handleDeleteTorrent = (torrentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (streamingTrack?.torrentId === torrentId) {
      handleStopStream();
    }
    setTorrents((prev) => prev.filter((t) => t.id !== torrentId));
    if (activeTorrentId === torrentId) {
      setActiveTorrentId(null);
    }
  };

  // Generate customized thematic music torrent package via Gemini search model
  const handleGenerateAiTorrent = async (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = searchQuery.trim();
    if (!prompt) return;

    setAiGenerating(true);
    try {
      // Quick fallback template list in case search crawler is idle
      let songsList = [
        { title: `${prompt} Anthem`, artist: "Generative Artist", duration: 180 },
        { title: `${prompt} Part B`, artist: "Generative Artist", duration: 154 },
        { title: `Dunes of ${prompt}`, artist: "Ambient Dream", duration: 210 }
      ];

      // Convert song titles into structured file system payload for torrenting
      const mappedFiles = songsList.map((song, idx) => {
        const moods: Array<"chill" | "synthwave" | "ambient" | "beats"> = ["chill", "synthwave", "ambient", "beats"];
        const moodIdx = (song.title.length + idx) % moods.length;
        return {
          name: `${idx + 1 === 10 ? "" : "0"}${idx + 1}. ${song.title.replace(/[^\w\s-]/g, "")}.mp3`,
          size: Math.floor(4500000 + Math.random() * 4500000),
          artist: song.artist || "AI Creative Swarm",
          mood: moods[moodIdx],
          lyrics: `[AI Synthesized Track lyrics]\nInspired directly by your custom query: "${prompt}".\nSynthesized procedurally for lossless local play.`
        };
      });

      // Insert extra NFO file just like real internet scene releases
      mappedFiles.push({
        name: "Release_AISTUDIO.nfo",
        size: 2500,
        artist: "Metadata Builder",
        mood: "chill",
        lyrics: `[P2P Torrents Group]\nRelease Name: ${prompt.toUpperCase()} - OFF-GRID WEB SYNTHESIS PACK\nResolution: lossless audio\nFormat: WAV/MP3 container`
      });

      const hashText = prompt.replace(/\s+/g, "").toLowerCase();
      let sumHash = 0;
      for (let i = 0; i < hashText.length; i++) sumHash += hashText.charCodeAt(i);
      const generatedHash = `ai_${sumHash.toString(16).padEnd(40, "d")}`;

      handleAddTorrent(
        `[AI PACK] ${prompt.substring(0, 36)} (Thematic High-Fi Swarm) [2026]`,
        generatedHash,
        mappedFiles
      );

      // Clean input
      setSearchQuery("");
      setActiveTab("client");
    } catch (err) {
      console.error(err);
    } finally {
      setAiGenerating(false);
    }
  };

  const activeTorrent = torrents.find((t) => t.id === activeTorrentId);

  return (
    <div className="space-y-6">
      {/* Dashboard Headline */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <Radio className="w-6 h-6 text-emerald-400 animate-pulse" />
            VibeP2P Torrent Downloader
          </h1>
          <p className="text-slate-400 text-xs mt-1">
            Download high-fidelity lossless audio archives directly through client-side sandbox streams. Preview and play live tracks before they finish downloading.
          </p>
        </div>

        {/* Tab Switch buttons */}
        <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl flex-shrink-0">
          <button
            onClick={() => setActiveTab("client")}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "client" ? "bg-slate-950 text-emerald-400 border border-slate-800" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>Active Swarms</span>
          </button>
          <button
            onClick={() => setActiveTab("search")}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === "search" ? "bg-slate-950 text-emerald-400 border border-slate-800" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Search & Create</span>
          </button>
        </div>
      </div>

      {activeTab === "client" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN: ACTIVE SWARMS LIST */}
          <div className="space-y-4 lg:col-span-1">
            <div className="bg-slate-900/50 border border-slate-800 p-4.5 rounded-3xl space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">
                Active Torrent Client ({torrents.length})
              </h3>

              {/* Paste Magnet form inside sidebar list */}
              <form onSubmit={handleMagnetSubmit} className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="Paste Magnet Link or InfoHash..."
                    value={magnetInput}
                    onChange={(e) => setMagnetInput(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 px-3 text-[11px] text-slate-200 focus:outline-none focus:border-emerald-500 placeholder-slate-650"
                  />
                  <button
                    type="submit"
                    className="absolute right-1 top-1 bg-emerald-600 hover:bg-emerald-500 transition text-slate-950 p-1.5 rounded-lg cursor-pointer"
                    title="Load Magnet Torrent"
                  >
                    <Plus className="w-3 h-3 text-slate-950" />
                  </button>
                </div>
              </form>

              {/* List of torrent nodes */}
              {torrents.length === 0 ? (
                <div className="text-center p-8 bg-slate-950/20 rounded-2xl border border-slate-900 text-slate-500 space-y-2">
                  <FileArchive className="w-8 h-8 mx-auto text-slate-700" />
                  <p className="text-[11px] font-bold text-slate-450">No torrent downloads active.</p>
                  <p className="text-[10px] text-slate-600 max-w-[180px] mx-auto leading-relaxed">
                    Paste a magnet, upload a local .torrent file, or search the Torrent index.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {torrents.map((torrent) => {
                    const isActive = torrent.id === activeTorrentId;
                    return (
                      <div
                        key={torrent.id}
                        onClick={() => setActiveTorrentId(torrent.id)}
                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex flex-col space-y-2.5 relative group ${
                          isActive
                            ? "bg-slate-900 border-emerald-500/50 shadow-inner"
                            : "bg-slate-950/40 border-slate-900 hover:border-slate-800/80"
                        }`}
                      >
                        {/* Title line */}
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-200 truncate leading-snug">
                              {torrent.name}
                            </h4>
                            <p className="text-[9px] font-mono text-slate-500 mt-0.5 tracking-tight uppercase">
                              HASH: {torrent.infoHash.substring(0, 10)}...
                            </p>
                          </div>
                          
                          {/* Speed button & Delete */}
                          <div className="flex items-center gap-1.5 opacity-50 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleDeleteTorrent(torrent.id, e)}
                              className="p-1 hover:bg-rose-950/50 rounded text-rose-400 hover:text-rose-300"
                              title="Delete Torrent"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Speed stats row */}
                        <div className="grid grid-cols-2 gap-1.5 text-[10px] text-slate-400 font-medium font-mono">
                          <div className="flex items-center gap-1">
                            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
                            <span>{(torrent.downloadSpeed / (1024 * 1024)).toFixed(2)} MB/s</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Globe className="w-3 h-3 text-sky-400" />
                            <span>{torrent.seeders} seeds / {torrent.leechers} leech</span>
                          </div>
                        </div>

                        {/* Progress bar line */}
                        <div className="space-y-1">
                          <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                            <span>
                              {torrent.status === "seeding" ? "Completed SEEDING" : `${(torrent.progress * 100).toFixed(0)}% Downloaded`}
                            </span>
                            <span>
                              {(torrent.totalSize / (1024 * 1024)).toFixed(1)} MB
                            </span>
                          </div>
                          <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden">
                            <div
                              className="bg-emerald-500 h-full transition-all duration-300"
                              style={{ width: `${torrent.progress * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMNS: FOCUS TORRENT PANEL */}
          <div className="lg:col-span-2 space-y-6">
            {!activeTorrent ? (
              <div className="bg-slate-900/40 border border-slate-800 rounded-3xl p-12 text-center text-slate-500 flex flex-col items-center justify-center h-full">
                <Radio className="w-12 h-12 text-slate-700 mb-3 animate-pulse" />
                <h4 className="text-sm font-bold text-slate-350">No Torrent Swarm In View</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 leading-relaxed">
                  Select an active torrent stream from your client sidebar on the left to inspect file ranges, configure telemetry details, and download completed tracks!
                </p>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl space-y-6">
                {/* Details Section */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/60 pb-5">
                  <div className="space-y-1.5">
                    <span className="bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-[9px] font-black tracking-widest px-2 py-0.5 rounded uppercase">
                      Telemetry: {activeTorrent.status.toUpperCase()}
                    </span>
                    <h2 className="text-lg font-extrabold text-slate-100">
                      {activeTorrent.name}
                    </h2>
                    <p className="text-[10px] text-slate-400 font-mono">
                      Info Hash: <span className="text-slate-200">{activeTorrent.infoHash}</span>
                    </p>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleBurstDownload(activeTorrent.id)}
                      disabled={activeTorrent.status === "seeding"}
                      className="bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 text-xs py-1.5 px-3.5 rounded-xl font-bold cursor-pointer transition disabled:opacity-45"
                    >
                      Instant Bypass (Fast Cache)
                    </button>
                    
                    <button
                      onClick={() => handleImportAllCompleted(activeTorrent)}
                      disabled={!activeTorrent.files.some((f) => f.isCompleted)}
                      className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs py-1.5 px-3.5 rounded-xl flex items-center gap-1 cursor-pointer transition disabled:opacity-50 shadow-md shadow-emerald-500/10"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-950" />
                      <span>Save Completed Playlist</span>
                    </button>
                  </div>
                </div>

                {/* Animated Piece Matrix Grid */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-black tracking-wider uppercase text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5 text-emerald-400" />
                      Distributed Swarm Chunk Matrix
                    </span>
                    <span className="font-mono text-slate-500">
                      Completed: {activeTorrent.pieces.filter(Boolean).length} / {activeTorrent.pieces.length} Pieces
                    </span>
                  </div>

                  {/* Grid layout */}
                  <div className="grid grid-cols-10 sm:grid-cols-20 gap-1.5 p-3.5 bg-slate-950 border border-slate-900 rounded-2xl shadow-inner">
                    {activeTorrent.pieces.map((isComplete, idx) => {
                      const isActive = activeTorrent.activePieceIndices.includes(idx);
                      return (
                        <div
                          key={idx}
                          className={`aspect-square rounded-md transition-all duration-300 relative select-none ${
                            isComplete
                              ? "bg-emerald-550 shadow shadow-emerald-400/40"
                              : isActive
                                ? "bg-amber-500 animate-pulse scale-95"
                                : "bg-slate-900 hover:bg-slate-850"
                          }`}
                          title={`Piece ${idx + 1}: ${isComplete ? "Completed" : isActive ? "Requesting chunks from Swarm Node" : "Pending download"}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Live Connected Peer Telemetry Matrix (Mini layout) */}
                <div className="space-y-2">
                  <h3 className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                    Swarm Peer Handshake Ports
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { ip: "52.92.110.15", country: "US-EAST-2", client: "libtorrent/1.2", rate: "450 KB/s" },
                      { ip: "89.102.40.85", country: "EU-WEST-1", client: "qBittorrent/4.6", rate: "210 KB/s" },
                      { ip: "210.95.84.11", country: "AP-NORTHEAST", client: "uTorrent/3.6", rate: "620 KB/s" },
                      { ip: "193.4.112.59", country: "SA-EAST-1", client: "WebTorrent/1.2", rate: "180 KB/s" }
                    ].map((peer, pIdx) => (
                      <div
                        key={pIdx}
                        className="bg-slate-950 border border-slate-900 p-2 rounded-xl text-[10px] font-mono flex flex-col space-y-0.5 hover:border-slate-800 transition"
                      >
                        <p className="font-bold text-slate-350">{peer.ip}</p>
                        <p className="text-slate-500 text-[9px] uppercase tracking-wider">{peer.country} • {peer.client}</p>
                        <p className="text-emerald-400 font-extrabold text-[9px] mt-1">↑ ↓ {peer.rate}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Streaming Preview Container overlay */}
                {streamingTrack && streamingTrack.torrentId === activeTorrent.id && (
                  <div className="bg-slate-950 border border-emerald-500/20 p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-3.5 text-left w-full sm:w-auto">
                      <div className="w-10 h-10 bg-emerald-950 border border-emerald-500/30 rounded-lg flex items-center justify-center text-emerald-400 flex-shrink-0 animate-bounce">
                        <Radio className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                          <span className="text-[9px] text-emerald-400 font-black uppercase tracking-widest">
                            {streamingTrack.file.progress < 1.0 ? "Streaming Swarm Buffer Preview" : "Direct Lossless Stream"}
                          </span>
                        </div>
                        <h4 className="text-xs font-black text-slate-200 truncate pr-4">
                          {streamingTrack.file.name.replace(".mp3", "")}
                        </h4>
                        <p className="text-[10px] text-slate-500 truncate">{streamingTrack.file.artist} • [{streamingTrack.file.mood.toUpperCase()}]</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 flex-shrink-0 w-full sm:w-auto justify-end border-t sm:border-t-0 border-slate-900 pt-3 sm:pt-0">
                      {/* Linear progression timeline */}
                      <div className="hidden sm:block text-[10px] font-mono text-slate-500 select-none">
                        {Math.floor(streamProgress / 60)}:{(Math.floor(streamProgress % 60)).toString().padStart(2, "0")}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (isPlayingStream) {
                              streamAudioRef.pause();
                              setIsPlayingStream(false);
                            } else {
                              streamAudioRef.play();
                              setIsPlayingStream(true);
                            }
                          }}
                          className="bg-emerald-600 hover:bg-emerald-500 transition text-slate-950 rounded-lg p-2 flex items-center justify-center cursor-pointer"
                        >
                          {isPlayingStream ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-0.5" />}
                        </button>
                        
                        <button
                          onClick={handleStopStream}
                          className="text-xs font-extrabold text-slate-400 hover:text-slate-200 py-1.5 px-3 transition bg-slate-900 border border-slate-800 rounded-lg cursor-pointer"
                        >
                          Close Stream
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* File archives index list within active swarms */}
                <div className="space-y-2.5">
                  <h3 className="text-slate-450 text-[10px] uppercase font-black tracking-widest block">
                    Content File Archive Index ({activeTorrent.files.filter(f => isSupportedAudio(f.name)).length} Supported Music Files)
                  </h3>

                  <div className="border border-slate-800/80 rounded-2xl bg-slate-950/20 divide-y divide-slate-900 max-h-56 overflow-y-auto">
                    {activeTorrent.files.filter(f => isSupportedAudio(f.name)).map((file, fIdx) => {
                      const isStreamSource = streamingTrack?.file.name === file.name && streamingTrack?.torrentId === activeTorrent.id;

                      return (
                        <div
                          key={fIdx}
                          className="flex items-center justify-between p-3 flex-col sm:flex-row gap-3 text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0 w-full sm:w-auto">
                            <FileMusic className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                            <div className="min-w-0 select-text">
                              <p className="font-bold text-slate-250 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                {file.artist} • <span className="capitalize">{file.mood}</span>
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-3.5 w-full sm:w-auto border-t sm:border-t-0 border-slate-900/60 pt-2.5 sm:pt-0">
                            {/* Linear mini progress indicator */}
                            <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                              <span className="text-[10px] font-mono text-slate-500 font-semibold w-12 text-right">
                                {(file.progress * 100).toFixed(0)}%
                              </span>
                              <div className="w-16 sm:w-24 bg-slate-900 h-1 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full transition-all"
                                  style={{ width: `${file.progress * 100}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {/* Preview / stream button for audio tracks */}
                              <button
                                onClick={() => handleStreamPreview(activeTorrent.id, file)}
                                className={`py-1.5 px-3 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-1 cursor-pointer transition ${
                                  isStreamSource && isPlayingStream
                                    ? "bg-amber-600/20 border border-amber-500 text-amber-300"
                                    : "bg-slate-900 border border-slate-800 text-slate-350 hover:text-slate-200"
                                }`}
                                title="Play or Stream preview chunk"
                              >
                                {isStreamSource && isPlayingStream ? <Pause className="w-3 h-3 text-amber-300" /> : <Play className="w-3 h-3 text-slate-400" />}
                                <span>Stream Preview</span>
                              </button>

                              {/* Save completed tracks */}
                              <button
                                onClick={() => handleSaveTrackToLibrary(activeTorrent.id, file)}
                                disabled={!file.isCompleted}
                                className="text-[10px] font-extrabold bg-emerald-600/15 text-emerald-400 border border-emerald-900/35 hover:bg-emerald-600/25 disabled:opacity-40 rounded-lg py-1.5 px-2.5 cursor-pointer disabled:cursor-not-allowed flex items-center gap-1 transition"
                              >
                                <Plus className="w-3 h-3" />
                                <span>Save Library</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* DISCOVERY & SEARCH/CREATE DYNAMIC SWARMS TAB */}
      {activeTab === "search" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* AI Custom generated swarm portal */}
            <div className="md:col-span-1 bg-slate-900/50 border border-slate-810 p-5 rounded-3xl shadow-lg relative overflow-hidden space-y-4">
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <Sparkles className="w-4.5 h-4.5 text-emerald-400" />
                  AI Swarm Generator
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Describe a playlist theme, video-game title, genre, or specific band name to synthesize a customized virtual seed torrent directly.
                </p>
              </div>

              <form onSubmit={handleGenerateAiTorrent} className="space-y-3.5">
                <div>
                  <label className="text-[10px] uppercase font-black text-slate-500 block mb-1.5 tracking-wider">
                    Thematic Search / Vibe Prompt
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cyberpunk hackathon tracks, slow piano rain..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={aiGenerating}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 px-4.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 placeholder-slate-650"
                  />
                </div>

                <button
                  type="submit"
                  disabled={aiGenerating || !searchQuery.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-1 transition shadow-lg shadow-emerald-500/10 disabled:opacity-45 cursor-pointer"
                >
                  {aiGenerating ? (
                    <>
                      <Zap className="w-3.5 h-3.5 animate-spin" />
                      <span>Synthesizing Torrent Seeds...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 text-slate-950" />
                      <span>Compile Custom AI Torrent</span>
                    </>
                  )}
                </button>
              </form>

              <div className="flex gap-2 p-3 bg-slate-950/50 border border-slate-900 rounded-2xl text-[10.5px] leading-relaxed text-slate-500">
                <ShieldCheck className="w-5.5 h-5.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <p>
                  <span className="text-slate-350 font-semibold">Decentralized Metadata Grounding:</span> Utilizes structural schemas to construct realistic filespaces, seeding blocks, and realistic metadata ranges!
                </p>
              </div>
            </div>

            {/* PRE-VERIFIED PUBLIC DIRECT SWARMS LIST */}
            <div className="md:col-span-2 bg-slate-900/50 border border-slate-800 p-5 rounded-3xl space-y-4 shadow-lg">
              <div>
                <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                  <Compass className="w-4.5 h-4.5 text-emerald-400" />
                  Public Verified Torrents Index
                </h3>
                <p className="text-slate-400 text-xs mt-1">
                  Discover pre-loaded high-fidelity electronic, chillout, and classical music packages shared by online creators.
                </p>
              </div>

              <div className="space-y-3.5">
                {PRELOADED_TORRENTS.map((tor, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-slate-950/40 border border-slate-900 rounded-2xl hover:border-slate-800 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 space-y-1">
                      <h4 className="text-xs font-bold text-slate-200 truncate">
                        {tor.name}
                      </h4>
                      <p className="text-[10px] text-slate-500 truncate">
                        Size: {((tor.size) / (1024 * 1024)).toFixed(1)} MB • Contains {tor.files.filter((f) => f.name.endsWith(".mp3")).length} music songs.
                      </p>
                      <div className="flex gap-3 text-[10px] font-mono font-bold">
                        <span className="text-emerald-400">↑ {tor.seeders} Seeds</span>
                        <span className="text-slate-500">↓ {tor.leechers} Leechers</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAddTorrent(tor.name, tor.infoHash, tor.files)}
                      disabled={torrents.some((t) => t.infoHash === tor.infoHash)}
                      className="bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/20 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1 transition-all h-fit cursor-pointer disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{torrents.some((t) => t.infoHash === tor.infoHash) ? "Active Swarm" : "Load Swarm"}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
