import { useState, useEffect, useRef } from "react";
import { Track, Playlist, PlaybackState, UserProfile } from "./types";
import { initDB, getAllTracks, getAllPlaylists, saveTrack, savePlaylist, autoDeduplicateTracks } from "./lib/db";
import { AudioEngine } from "./lib/AudioEngine";
import { PlayerScreen } from "./components/PlayerScreen";
import { LibraryScreen } from "./components/LibraryScreen";
import { ImporterScreen } from "./components/ImporterScreen";
import { PlaylistsScreen } from "./components/PlaylistsScreen";
import { TorrentScreen } from "./components/TorrentScreen";
import { 
  Play, Pause, SkipForward, SkipBack, Disc, Music, FolderHeart, Globe, Sliders, Smartphone, Volume2, VolumeX, Download, Loader2, Sun, Moon, Monitor, FileText, Settings, Radio
} from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"player" | "library" | "playlists" | "importer" | "torrent">("player");
  const theme = "dark";

  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const cached = localStorage.getItem("player_user_profile");
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {}
    }
    return {
      email: "lylesantos@gmail.com",
      displayName: "Lyle Santos",
      avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=Lyle",
      isLoggedIn: false,
      provider: "none"
    };
  });
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Enforce Twilight Dark Mode layout globally
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
  }, []);

  const [isGapless, setIsGapless] = useState<boolean>(() => {
    return localStorage.getItem("player_gapless") === "true";
  });

  useEffect(() => {
    localStorage.setItem("player_gapless", String(isGapless));
  }, [isGapless]);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  
  // Playback States
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState<'none' | 'all' | 'one'>('none');
  const [showEQ, setShowEQ] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Queue controller
  const [queue, setQueue] = useState<Track[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const audioEngine = AudioEngine.getInstance();

  // Shared playlist URL query parse states
  const [sharedPlaylistToImport, setSharedPlaylistToImport] = useState<any | null>(null);
  const [isImportingSharedUrl, setIsImportingSharedUrl] = useState(false);
  const [importUrlStatus, setImportUrlStatus] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareData = params.get("share_playlist");
    if (shareData) {
      try {
        const decoded = decodeURIComponent(escape(atob(shareData)));
        const parsed = JSON.parse(decoded);
        if (parsed && parsed.name && parsed.tracks) {
          setSharedPlaylistToImport(parsed);
        }
      } catch (err) {
        console.error("Failed to parse shared playlist URL:", err);
      }
    }
  }, []);

  const handleImportSharedUrlPlaylist = async () => {
    if (!sharedPlaylistToImport) return;
    setIsImportingSharedUrl(true);
    setImportUrlStatus("Initializing playlist synthesis...");
    try {
      const { generateProceduralCoverArt, generateProceduralTrack } = await import("./lib/AudioSynthesizer");
      const pTracks = sharedPlaylistToImport.tracks || [];
      const savedTrackIds: string[] = [];

      for (let i = 0; i < pTracks.length; i++) {
        const item = pTracks[i];
        setImportUrlStatus(`Synthesizing track "${item.title}"... (${i + 1}/${pTracks.length})`);

        const existing = tracks.find(
          (t) => t.title.toLowerCase() === item.title.toLowerCase() && 
                 t.artist.toLowerCase() === item.artist.toLowerCase()
        );
        if (existing) {
          savedTrackIds.push(existing.id);
          continue;
        }

        const titleHash = item.title;
        const artistHash = item.artist || "Shared Artist";
        const moodOptions: Array<"chill" | "synthwave" | "ambient" | "beats"> = ["chill", "synthwave", "ambient", "beats"];
        const hashSeed = titleHash.length + artistHash.length;
        const selectedMood = moodOptions[hashSeed % moodOptions.length];

        const audioBlob = await generateProceduralTrack(titleHash, artistHash, selectedMood);
        const coverBase64 = item.coverUrl || generateProceduralCoverArt(item.title, artistHash);

        const newTrack: Track = {
          id: `shared_track_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`,
          title: item.title,
          artist: artistHash,
          album: item.album || "Shared Album",
          duration: item.duration || 20,
          fileSize: audioBlob.size,
          blob: audioBlob,
          coverUrl: coverBase64,
          lyrics: item.lyrics || "No lyrics available.",
          source: "synthesized",
          createdAt: Date.now()
        };

        await saveTrack(newTrack);
        savedTrackIds.push(newTrack.id);
      }

      const playlistId = `playlist_shared_${Date.now()}`;
      const newPlaylist: Playlist = {
        id: playlistId,
        name: sharedPlaylistToImport.name,
        description: sharedPlaylistToImport.description || "Shared from another user's offline collection.",
        trackIds: savedTrackIds,
        coverUrl: sharedPlaylistToImport.coverUrl || generateProceduralCoverArt(sharedPlaylistToImport.name, "Core Network"),
        createdAt: Date.now()
      };

      await savePlaylist(newPlaylist);
      await refreshData();
      setSharedPlaylistToImport(null);
      setImportUrlStatus("");
      alert(`Successfully imported share: "${newPlaylist.name}" with ${savedTrackIds.length} tracks!`);
      
      const url = new URL(window.location.href);
      url.searchParams.delete("share_playlist");
      window.history.replaceState({}, document.title, url.toString());
      setActiveTab("playlists");
    } catch (err) {
      console.error("Synthesizing query import playlist failure:", err);
      alert("Failed to synthesize the playlist from the URL.");
      setImportUrlStatus("");
    } finally {
      setIsImportingSharedUrl(false);
    }
  };

  // 1. Initial database bootstrap
  useEffect(() => {
    initDB()
      .then(() => {
        refreshData();
      })
      .catch((err) => {
        console.error("IndexedDB bootstrap error:", err);
      });
  }, []);

  const refreshData = async () => {
    try {
      await autoDeduplicateTracks();
      const dbTracks = await getAllTracks();
      const dbPlaylists = await getAllPlaylists();
      
      setTracks(dbTracks.sort((a, b) => b.createdAt - a.createdAt));
      setPlaylists(dbPlaylists.sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      console.error("Error loading offline databases & cleaning duplicates: ", err);
    }
  };

  // 2. Synchronize Audio Player Events with React States
  useEffect(() => {
    const handleTimeUpdate = () => {
      const cur = audioEngine.audio.currentTime;
      const dur = audioEngine.audio.duration;
      setProgress(cur);

      // Pre-emptive gapless swap (0.15s trigger bypasses general HTML5 end-to-decode latency block)
      if (isGapless && dur > 0 && cur >= dur - 0.15) {
        // Prevent recursive event bubbling by zeroing immediately
        audioEngine.audio.currentTime = 0;
        handleNextTrack();
      }
    };

    const handleEnded = () => {
      handleNextTrack();
    };

    const handleAudioPlay = () => {
      setIsPlaying(true);
    };

    const handleAudioPause = () => {
      setIsPlaying(false);
    };

    // Attach native media listeners
    audioEngine.audio.addEventListener("timeupdate", handleTimeUpdate);
    audioEngine.audio.addEventListener("ended", handleEnded);
    audioEngine.audio.addEventListener("play", handleAudioPlay);
    audioEngine.audio.addEventListener("pause", handleAudioPause);

    // Initial audio configuration setup
    audioEngine.setVolume(volume);

    return () => {
      audioEngine.audio.removeEventListener("timeupdate", handleTimeUpdate);
      audioEngine.audio.removeEventListener("ended", handleEnded);
      audioEngine.audio.removeEventListener("play", handleAudioPlay);
      audioEngine.audio.removeEventListener("pause", handleAudioPause);
    };
  }, [queue, currentTrack, isRepeat, isShuffle, isGapless]);

  // Opt-in background caching for Gapless Playback lookahead warming
  useEffect(() => {
    if (!isGapless || !currentTrack || queue.length <= 1) return;

    const idx = queue.findIndex(t => t.id === currentTrack.id);
    if (idx === -1) return;

    const nextIdx = (idx + 1) % queue.length;
    const nextTrack = queue[nextIdx];
    if (!nextTrack || !nextTrack.blob) return;

    // Hot-warm next track audio payload in background
    let tempUrl = URL.createObjectURL(nextTrack.blob);
    const warmAudio = new Audio();
    warmAudio.src = tempUrl;
    warmAudio.preload = "auto";
    warmAudio.volume = 0;

    return () => {
      if (tempUrl) {
        URL.revokeObjectURL(tempUrl);
      }
    };
  }, [currentTrack, queue, isGapless]);

  // Clean object url memory references to avoid web leaks
  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [objectUrl]);

  // 3. Playback Controls Core Logic
  const handleTrackSelector = (track: Track, parentPlaylist?: Playlist) => {
    setCurrentTrack(track);
    
    // Setup playback queue hierarchy
    if (parentPlaylist) {
      setActivePlaylist(parentPlaylist);
      const playlistTracks = parentPlaylist.trackIds
        .map(id => tracks.find(t => t.id === id))
        .filter((t): t is Track => !!t);
      setQueue(playlistTracks);
    } else {
      setActivePlaylist(null);
      setQueue(tracks); // Queue is standard library if played solo
    }

    // Load actual audio Blob dynamically from IndexedDB
    if (track.blob) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      const newUrl = URL.createObjectURL(track.blob);
      setObjectUrl(newUrl);
      audioEngine.playTrack(newUrl);
    }
    
    // Jump straight to Player screen
    setActiveTab("player");
  };

  const handleTogglePlay = () => {
    if (!currentTrack) return;
    if (isPlaying) {
      audioEngine.pause();
    } else {
      if (objectUrl) {
        audioEngine.playTrack(objectUrl);
      }
    }
  };

  const handleNextTrack = () => {
    if (queue.length === 0 || !currentTrack) return;

    if (isRepeat === 'one') {
      // Loop track
      audioEngine.seek(0);
      if (objectUrl) audioEngine.playTrack(objectUrl);
      return;
    }

    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    let nextIndex = currentIndex + 1;

    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (nextIndex >= queue.length) {
      if (isRepeat === 'all') {
        nextIndex = 0;
      } else {
        audioEngine.stop();
        return; // Stop queue at end
      }
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      handleTrackSelector(nextTrack, activePlaylist || undefined);
    }
  };

  const handlePrevTrack = () => {
    if (queue.length === 0 || !currentTrack) return;

    // Reset track if playing past 3s
    if (audioEngine.audio.currentTime > 3) {
      audioEngine.seek(0);
      return;
    }

    const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
    let prevIndex = currentIndex - 1;

    if (prevIndex < 0) {
      if (isRepeat === 'all') {
        prevIndex = queue.length - 1;
      } else {
        prevIndex = 0; // loop back to first track
      }
    }

    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      handleTrackSelector(prevTrack, activePlaylist || undefined);
    }
  };

  const handleSeek = (seconds: number) => {
    audioEngine.seek(seconds);
    setProgress(seconds);
  };

  const handleVolumeChange = (level: number) => {
    setVolume(level);
    audioEngine.setVolume(level);
    if (isMuted && level > 0) {
      setIsMuted(false);
      audioEngine.setMute(false);
    }
  };

  const handleMuteToggle = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    audioEngine.setMute(nextMute);
  };

  const handleShuffleToggle = () => {
    setIsShuffle(!isShuffle);
  };

  const handleRepeatToggle = () => {
    const sequence: Array<'none' | 'all' | 'one'> = ['none', 'all', 'one'];
    const idx = sequence.indexOf(isRepeat);
    const nextRepeat = sequence[(idx + 1) % sequence.length];
    setIsRepeat(nextRepeat);
  };

  const handleLyricUpdate = async (trackId: string, lyricsText: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (track) {
      const updatedTrack = { ...track, lyrics: lyricsText };
      await saveTrack(updatedTrack);
      refreshData();
    }
  };

  const playbackState: PlaybackState = {
    currentTrackId: currentTrack?.id || null,
    isPlaying,
    progress,
    volume,
    isMuted,
    isShuffle,
    isRepeat,
  };

  const userEmail = userProfile.email;
  const userInitials = userProfile.displayName 
    ? userProfile.displayName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) 
    : "US";



  return (
    <div className="min-h-screen bg-[var(--bg-outer)] text-slate-100 flex items-center justify-center font-sans p-0 md:p-6 select-none">
      {/* Outer shell mimicking VibePlayer responsive container */}
      <div className="w-full h-screen md:h-[768px] max-w-5xl bg-slate-950 md:rounded-3xl md:border md:border-slate-800/80 shadow-2xl flex overflow-hidden relative">
        
        {/* LEFT SIDEBAR (Visible only on desktop screens in theme style) */}
        <aside className="hidden md:flex w-72 h-full bg-slate-900 border-r border-slate-800/60 flex-col justify-between flex-shrink-0">
          <div>
            {/* Header & Logo with Emerald gradient */}
            <div className="p-6 flex items-center gap-3">
              <div className="w-8 h-8 neon-accent rounded-lg flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Music className="w-4 h-4 text-slate-950" />
              </div>
              <span className="text-lg font-black tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                VibePlayer
              </span>
            </div>

            {/* Navigation links targeting state tabs */}
            <nav className="px-4 space-y-1.5 mt-2">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2.5 mb-2.5">
                Music Hub
              </div>
              
              <button
                onClick={() => setActiveTab("player")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "player"
                    ? "bg-slate-800 text-emerald-400 border-l-2 border-emerald-500"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <Disc className={`w-4 h-4 ${isPlaying && activeTab === "player" ? "animate-spin" : ""}`} style={{ animationDuration: "12s" }} />
                <span>Now Playing</span>
              </button>

              <button
                onClick={() => setActiveTab("library")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "library"
                    ? "bg-slate-800 text-emerald-400 border-l-2 border-emerald-500"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <Music className="w-4 h-4" />
                <span>Music Library</span>
              </button>

              <button
                onClick={() => setActiveTab("playlists")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "playlists"
                    ? "bg-slate-800 text-emerald-400 border-l-2 border-emerald-500"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <FolderHeart className="w-4 h-4" />
                <span>Playlists</span>
              </button>

              <button
                onClick={() => setActiveTab("importer")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "importer"
                    ? "bg-slate-800 text-emerald-400 border-l-2 border-emerald-500"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>Web Importer</span>
              </button>

              <button
                onClick={() => setActiveTab("torrent")}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === "torrent"
                    ? "bg-slate-800 text-emerald-400 border-l-2 border-emerald-500"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <Radio className="w-4 h-4" />
                <span>Torrent Hub</span>
              </button>


            </nav>
          </div>



          {/* Bottom active local storage info */}
          <div className="p-6 border-t border-slate-850">
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 sleek-glass">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Offline Storage</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                {tracks.length} active tracks imported. All lyrics and wave chunks fully synced inside IndexedDB cache.
              </p>
            </div>
          </div>
        </aside>

        {/* RIGHT CONTENT WORKSPACE */}
        <main className="flex-1 flex flex-col relative overflow-hidden h-full bg-slate-950">
          
          {/* Header Bar Area */}
          <header className="p-5 flex justify-between items-center border-b border-slate-850 bg-slate-950/40 backdrop-blur-md z-30 select-none">
            <div className="flex items-center gap-3">
              {/* Responsive App Launcher branding for mobile */}
              <div className="md:hidden flex items-center gap-2">
                <div className="w-6 h-6 neon-accent rounded-md flex items-center justify-center">
                  <Music className="w-3.5 h-3.5 text-slate-950" />
                </div>
                <span className="text-sm font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">VibePlayer</span>
              </div>
              
              <div className="hidden md:flex items-center gap-2 text-[10px] font-mono text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>OFFLINE MEDIA ENGINE v1.2</span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Quick-toggle music controls (EQ, Lyrics, Settings) in header */}
              {currentTrack && (
                <div id="header-playback-controls" className="flex gap-1.5 flex-shrink-0 mr-1 select-none">
                  <button 
                    onClick={() => { 
                      setActiveTab("player");
                      // Toggle if not already on EQ or Tab, else toggle state
                      if (activeTab !== "player") {
                        setShowEQ(true); showLyrics && setShowLyrics(false); showSettings && setShowSettings(false);
                      } else {
                        setShowEQ(!showEQ); if (!showEQ) { setShowLyrics(false); setShowSettings(false); }
                      }
                    }}
                    className={`p-1.5 sm:p-2 rounded-xl transition-all border cursor-pointer ${
                      showEQ && activeTab === "player" ? "bg-emerald-600/20 border-emerald-500 text-emerald-300" : "bg-slate-900/50 border-slate-800 hover:text-slate-200 text-slate-400"
                    }`}
                    title="Toggle Equalizer"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => { 
                      setActiveTab("player");
                      if (activeTab !== "player") {
                        setShowLyrics(true); showEQ && setShowEQ(false); showSettings && setShowSettings(false);
                      } else {
                        setShowLyrics(!showLyrics); if (!showLyrics) { setShowEQ(false); setShowSettings(false); }
                      }
                    }}
                    className={`p-1.5 sm:p-2 rounded-xl transition-all border cursor-pointer ${
                      showLyrics && activeTab === "player" ? "bg-emerald-600/20 border-emerald-505 text-emerald-300" : "bg-slate-900/50 border-slate-800 hover:text-slate-200 text-slate-400"
                    }`}
                    title="Lyrics Viewer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => { 
                      setActiveTab("player");
                      if (activeTab !== "player") {
                        setShowSettings(true); showEQ && setShowEQ(false); showLyrics && setShowLyrics(false);
                      } else {
                        setShowSettings(!showSettings); if (!showSettings) { setShowEQ(false); setShowLyrics(false); }
                      }
                    }}
                    className={`p-1.5 sm:p-2 rounded-xl transition-all border cursor-pointer ${
                      showSettings && activeTab === "player" ? "bg-emerald-600/20 border-emerald-500 text-emerald-300" : "bg-slate-900/50 border-slate-800 hover:text-slate-200 text-slate-400"
                    }`}
                    title="Display Options"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Gapless Playback Header Status Indicator */}
              <div 
                className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[9px] font-mono font-black uppercase tracking-widest transition-all duration-300 ${
                  isGapless 
                    ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-400 shadow-md shadow-emerald-500/5" 
                    : "bg-slate-905 p-1.5 border-slate-850 text-slate-500"
                }`}
                title="Gapless Engine Status"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${isGapless ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
                <span>{isGapless ? "Gapless Seamless Buffering" : "Standard Transitions"}</span>
              </div>
            </div>
          </header>

          {/* Active Screen Tab Router rendering */}
          <div className="flex-1 overflow-y-auto p-5 pb-28 md:pb-6">
            {sharedPlaylistToImport && (
              <div className="mb-6 bg-emerald-950/40 border border-emerald-900/60 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 sleek-glass">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Shared Playlist Found</span>
                  </div>
                  <h4 className="text-xs font-extrabold text-slate-100">
                    Import "{sharedPlaylistToImport.name}" with {sharedPlaylistToImport.tracks?.length || 0} tracks?
                  </h4>
                  <p className="text-[11px] text-slate-400 max-w-xl">
                    This offline folder can be imported into your library. The audio lines will be customized and generated instantly.
                  </p>
                  {importUrlStatus && (
                    <p className="text-[10px] text-emerald-400 font-mono mt-1 font-semibold">{importUrlStatus}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setSharedPlaylistToImport(null)}
                    disabled={isImportingSharedUrl}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Ignore
                  </button>
                  <button
                    onClick={handleImportSharedUrlPlaylist}
                    disabled={isImportingSharedUrl}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-black px-4.5 py-1.5 rounded-xl text-xs transition-colors flex items-center gap-1 shadow-md shadow-emerald-900/30"
                  >
                    {isImportingSharedUrl ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" />
                        <span>Accept & Import</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {activeTab === "player" && (
              <PlayerScreen
                currentTrack={currentTrack}
                playbackState={playbackState}
                onTogglePlay={handleTogglePlay}
                onNext={handleNextTrack}
                onPrev={handlePrevTrack}
                onSeek={handleSeek}
                onVolumeChange={handleVolumeChange}
                onMuteToggle={handleMuteToggle}
                onShuffleToggle={handleShuffleToggle}
                onRepeatToggle={handleRepeatToggle}
                onUpdateTrackLyrics={handleLyricUpdate}
                isGapless={isGapless}
                onGaplessToggle={setIsGapless}
                showEQ={showEQ}
                setShowEQ={setShowEQ}
                showLyrics={showLyrics}
                setShowLyrics={setShowLyrics}
                showSettings={showSettings}
                setShowSettings={setShowSettings}
              />
            )}

            {activeTab === "library" && (
              <LibraryScreen
                tracks={tracks}
                onTracksUpdated={refreshData}
                onTrackPlay={(t) => handleTrackSelector(t)}
                currentTrackId={currentTrack?.id || null}
              />
            )}

            {activeTab === "playlists" && (
              <PlaylistsScreen
                playlists={playlists}
                tracks={tracks}
                onPlaylistsUpdated={refreshData}
                onTrackPlay={(t, p) => handleTrackSelector(t, p)}
                currentTrackId={currentTrack?.id || null}
              />
            )}

            {activeTab === "importer" && (
              <ImporterScreen
                onTracksUpdated={refreshData}
                onNavigateToPlaylists={() => setActiveTab("playlists")}
              />
            )}

            {activeTab === "torrent" && (
              <TorrentScreen
                onTracksUpdated={refreshData}
                onNavigateToPlaylists={() => setActiveTab("playlists")}
              />
            )}


          </div>

          {/* Floating mini audio media tray */}
          {currentTrack && activeTab !== "player" && (
            <div 
              onClick={() => setActiveTab("player")}
              className="fixed bottom-20 md:bottom-6 left-1/2 transform -translate-x-1/2 w-[92%] sm:max-w-sm bg-slate-900 border border-slate-800 p-2.5 rounded-2xl flex items-center justify-between gap-3 shadow-2xl z-40 cursor-pointer animate-in slide-in-from-bottom duration-300 sleek-glass"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800 border border-slate-700">
                  {currentTrack.coverUrl ? (
                    <img
                      src={currentTrack.coverUrl}
                      alt="cover"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Music className="w-4 h-4 text-slate-500" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 text-left">
                  <p className="text-xs font-bold text-slate-200 truncate">{currentTrack.title}</p>
                  <p className="text-[10px] text-slate-500 truncate">{currentTrack.artist}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTogglePlay();
                  }}
                  className="p-1.5 bg-emerald-650/10 hover:bg-emerald-650/20 text-emerald-450 border border-emerald-900/30 rounded-lg hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-0.5" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextTrack();
                  }}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Bottom active navigation nodes (Visible on mobile viewports matching design footer) */}
          <nav className="md:hidden absolute bottom-0 inset-x-0 bg-slate-950 border-t border-slate-900/80 py-2 px-1 flex items-center justify-between z-35 select-none overflow-x-auto gap-1 scrollbar-none">
            <button
              onClick={() => setActiveTab("player")}
              className={`flex flex-col items-center gap-1 text-[9px] font-extrabold py-1 px-1.5 transition-all flex-shrink-0 cursor-pointer ${
                activeTab === "player" ? "text-emerald-400 scale-105 font-black" : "text-slate-600 hover:text-slate-400"
              }`}
            >
              <Disc className={`w-4 h-4 ${isPlaying && activeTab === "player" ? "animate-spin" : ""}`} style={{ animationDuration: "12s" }} />
              <span>PLAYER</span>
            </button>

            <button
              onClick={() => setActiveTab("library")}
              className={`flex flex-col items-center gap-1 text-[9px] font-extrabold py-1 px-1.5 transition-all flex-shrink-0 cursor-pointer ${
                activeTab === "library" ? "text-emerald-400 scale-105 font-black" : "text-slate-600 hover:text-slate-400"
              }`}
            >
              <Music className="w-4 h-4" />
              <span>LIBRARY</span>
            </button>

            <button
              onClick={() => setActiveTab("playlists")}
              className={`flex flex-col items-center gap-1 text-[9px] font-extrabold py-1 px-1.5 transition-all flex-shrink-0 cursor-pointer ${
                activeTab === "playlists" ? "text-emerald-400 scale-105 font-black" : "text-slate-600 hover:text-slate-400"
              }`}
            >
              <FolderHeart className="w-4 h-4" />
              <span>PLAYLISTS</span>
            </button>



            <button
              onClick={() => setActiveTab("importer")}
              className={`flex flex-col items-center gap-1 text-[9px] font-extrabold py-1 px-1.5 transition-all flex-shrink-0 cursor-pointer ${
                activeTab === "importer" ? "text-emerald-400 scale-105" : "text-slate-600 hover:text-slate-400"
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>CRAWLER</span>
            </button>

            <button
              onClick={() => setActiveTab("torrent")}
              className={`flex flex-col items-center gap-1 text-[9px] font-extrabold py-1 px-1.5 transition-all flex-shrink-0 cursor-pointer ${
                activeTab === "torrent" ? "text-emerald-400 scale-105 font-black" : "text-slate-600 hover:text-slate-400"
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>TORRENT</span>
            </button>
          </nav>

        </main>
      </div>

    </div>
  );
}
