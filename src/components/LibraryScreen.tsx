import React, { useState, useRef } from "react";
import { Track } from "../types";
import { saveTrack, deleteTrack, clearAllTracks } from "../lib/db";
import { generateProceduralTrack, generateProceduralCoverArt } from "../lib/AudioSynthesizer";
import { readID3, writeID3 } from "../lib/id3";
import { Upload, Music, Trash2, Cpu, FileMusic, Sparkles, Wand2, Loader2, PlayCircle, Edit2, Check, AlertTriangle, X, Sliders, Filter, FolderOpen, HardDrive } from "lucide-react";

interface LibraryScreenProps {
  tracks: Track[];
  onTracksUpdated: () => void;
  onTrackPlay: (track: Track) => void;
  currentTrackId: string | null;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  tracks,
  onTracksUpdated,
  onTrackPlay,
  currentTrackId,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  // Advanced Storage Scan States & Filter Options
  const [filterSFX, setFilterSFX] = useState(true);
  const [filterRingtones, setFilterRingtones] = useState(true);
  const [filterNotifications, setFilterNotifications] = useState(true);
  const [filterShortClips, setFilterShortClips] = useState(true);
  const [filterMinSize, setFilterMinSize] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResults, setScanResults] = useState<{
    scanned: number;
    imported: number;
    filteredSFX: number;
    filteredRingtones: number;
    filteredNotifications: number;
    filteredSize: number;
    filteredDuration: number;
  } | null>(null);

  const folderInputRef = useRef<HTMLInputElement | null>(null);

  // Confirmation/Modal states to prevent iframe confirm() blocks
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [trackToDelete, setTrackToDelete] = useState<Track | null>(null);

  // ID3 Tag Editor states
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editArtist, setEditArtist] = useState("");
  const [editAlbum, setEditAlbum] = useState("");
  const [isSavingTags, setIsSavingTags] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleStartEdit = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent track playing
    setEditingTrackId(track.id);
    setEditTitle(track.title);
    setEditArtist(track.artist);
    setEditAlbum(track.album || "");
  };

  const handleCancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTrackId(null);
  };

  const handleSaveTags = async (track: Track, e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editTitle.trim()) {
      alert("Track title is required");
      return;
    }

    setIsSavingTags(true);
    setStatusMsg("Saving updated ID3 Tags to MP3...");

    try {
      let updatedBlob = track.blob;
      
      // If the file exists and is a local file with raw blob, write the binary tag
      if (track.blob && (track.source === "local" || track.source === "synthesized")) {
        try {
          updatedBlob = await writeID3(track.blob, {
            title: editTitle.trim(),
            artist: editArtist.trim(),
            album: editAlbum.trim(),
            coverUrl: track.coverUrl
          });
        } catch (binErr) {
          console.error("Binary ID3 tagging failed, using metadata fallback:", binErr);
        }
      }

      const updatedTrack: Track = {
        ...track,
        title: editTitle.trim(),
        artist: editArtist.trim(),
        album: editAlbum.trim(),
        blob: updatedBlob
      };

      await saveTrack(updatedTrack);
      onTracksUpdated();
      setEditingTrackId(null);
      setStatusMsg("ID3 Tags saved successfully!");
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err) {
      console.error("Error updating ID3 tags:", err);
      setStatusMsg("Failed to write ID3 tags.");
    } finally {
      setIsSavingTags(false);
    }
  };

  // Drag and Drop Handling (Complies fully with the File Upload Usability Pattern!)
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    processFiles(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files) as File[]);
    }
  };

  // Common file ingest logic
  const processFiles = (files: File[]) => {
    const modernAudioExtensions = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".oga", ".aac", ".webm", ".opus", ".wma", ".mp4", ".mka"];
    const audioFiles = files.filter((f) => {
      const lowerName = f.name.toLowerCase();
      return f.type.startsWith("audio/") || modernAudioExtensions.some(ext => lowerName.endsWith(ext));
    });
    
    if (audioFiles.length === 0) {
      alert("No audio files recognized. Please drag and drop supported music files (MP3, WAV, M4A, FLAC, OGG, AAC, WEBM, OPUS, etc.).");
      return;
    }

    setStatusMsg(`Importing ${audioFiles.length} file(s)...`);

    // Process files sequentially to avoid overriding statusMsg concurrently
    const processFiles = async () => {
      for (let i = 0; i < audioFiles.length; i++) {
        const file = audioFiles[i];
        setStatusMsg(`Analyzing filename "${file.name}"... (${i + 1}/${audioFiles.length})`);
        
        const audioUrl = URL.createObjectURL(file);
        
        try {
          const tempAudio = new Audio(audioUrl);
          
          await new Promise<void>((resolve, reject) => {
            tempAudio.onloadedmetadata = async () => {
              try {
                setStatusMsg(`Retrieving official info and CD cover artwork for "${file.name}"...`);
                
                let title = "";
                let artist = "";
                let album = "";
                let lyrics = "";
                let coverUrl = "";

                try {
                  const metaRes = await fetch("/api/collect-song-metadata", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: file.name })
                  });

                  if (metaRes.ok) {
                    const data = await metaRes.json();
                    title = data.title;
                    artist = data.artist;
                    album = data.album;
                    lyrics = data.lyrics;
                    coverUrl = data.coverUrl;
                  }
                } catch (metaErr) {
                  console.error("Metadata API extraction error:", metaErr);
                }

                // Fallback to local file elements if API fails or lacks results
                if (!title) {
                  const id3Tags = await readID3(file);
                  const cleanName = file.name.replace(/\.[^/.]+$/, "");
                  const parts = cleanName.split(" - ");
                  
                  title = id3Tags.title || parts[1] || parts[0];
                  artist = id3Tags.artist || (parts[1] ? parts[0] : "Local Artist");
                  album = id3Tags.album || "Local Upload";
                  coverUrl = id3Tags.coverUrl || "";
                }

                // If no cover came from AI/ID3, procedurally generate elegant canvas CD art
                if (!coverUrl) {
                  coverUrl = generateProceduralCoverArt(title, artist);
                }

                setStatusMsg(`Updating MP3 ID3 Tag binary segments...`);
                
                // Embed retrieved metadata & artwork into the MP3 file binary
                let updatedBlob: Blob = file;
                try {
                  updatedBlob = await writeID3(file, {
                    title,
                    artist,
                    album,
                    coverUrl
                  });
                } catch (tagErr) {
                  console.error("Failed to write ID3 binary tags:", tagErr);
                }

                const newTrack: Track = {
                  id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                  title,
                  artist,
                  album,
                  lyrics: lyrics || "Instrumental or No lyrics available.",
                  duration: Math.round(tempAudio.duration) || 180,
                  fileSize: updatedBlob.size,
                  blob: updatedBlob, // Save the updated file with embedded ID3 tags!
                  coverUrl,
                  source: "local",
                  createdAt: Date.now(),
                };

                await saveTrack(newTrack);
                onTracksUpdated();
                resolve();
              } catch (innerErr) {
                reject(innerErr);
              }
            };

            tempAudio.onerror = () => {
              reject(new Error("Audio load error"));
            };
          });

        } catch (fileErr) {
          console.error(`Failed to completely process file ${file.name}:`, fileErr);
        } finally {
          URL.revokeObjectURL(audioUrl);
        }
      }
      setStatusMsg("All files successfully imported with updated ID3 tags!");
      setTimeout(() => setStatusMsg(""), 3500);
    };

    processFiles();
  };

  const scanMountedDirectory = async () => {
    setIsScanning(true);
    setStatusMsg("Opening storage folder selector...");
    setScanResults(null);
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        setStatusMsg("Recursively scanning directory tree...");
        const files: File[] = [];
        await readDirectoryRecursive(dirHandle, files);
        await processScannedFiles(files);
      } else {
        // Fallback for browsers that don't support showDirectoryPicker (Firefox, iOS, Safari, iframe limits)
        if (folderInputRef.current) {
          folderInputRef.current.click();
        } else {
          setIsScanning(false);
          setStatusMsg("Standard directory scanning not supported in this client browser.");
          setTimeout(() => setStatusMsg(""), 3500);
        }
      }
    } catch (err: any) {
      setIsScanning(false);
      if (err.name !== "AbortError") {
        console.error("Directory scanning error:", err);
        setStatusMsg("Failed to scan folder. Try choosing files individually.");
        setTimeout(() => setStatusMsg(""), 3500);
      } else {
        setStatusMsg("Scanning aborted by user.");
        setTimeout(() => setStatusMsg(""), 2000);
      }
    }
  };

  const readDirectoryRecursive = async (dirHandle: any, collectedFiles: File[]) => {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        try {
          const file = await entry.getFile();
          collectedFiles.push(file);
        } catch (e) {
          console.error("Error reading file entry:", e);
        }
      } else if (entry.kind === 'directory') {
        try {
          await readDirectoryRecursive(entry, collectedFiles);
        } catch (e) {
          console.error("Error entering directory:", e);
        }
      }
    }
  };

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsScanning(true);
      setStatusMsg("Analyzing selected folder tracks...");
      processScannedFiles(Array.from(e.target.files) as File[]);
    } else {
      setIsScanning(false);
    }
  };

  const processScannedFiles = async (files: File[]) => {
    const modernAudioExtensions = [".mp3", ".wav", ".m4a", ".flac", ".ogg", ".oga", ".aac", ".webm", ".opus", ".wma", ".mp4", ".mka"];
    const audioFiles = files.filter((f) => {
      const lowerName = f.name.toLowerCase();
      return f.type.startsWith("audio/") || modernAudioExtensions.some(ext => lowerName.endsWith(ext));
    });

    if (audioFiles.length === 0) {
      setIsScanning(false);
      setStatusMsg("No valid music files (MP3, WAV, M4A, FLAC, OGG, AAC, WEBM, OPUS, etc.) found inside selected folder.");
      setTimeout(() => setStatusMsg(""), 3500);
      return;
    }

    let cntScanned = audioFiles.length;
    let cntFilteredSFX = 0;
    let cntFilteredRingtones = 0;
    let cntFilteredNotifications = 0;
    let cntFilteredSize = 0;
    let cntFilteredDuration = 0;
    let cntImported = 0;

    setStatusMsg(`Filtering and scanning files...`);

    const candidates: File[] = [];

    // Pre-filtering check by suffix keywords & size
    for (const file of audioFiles) {
      const nameL = file.name.toLowerCase();
      const pathL = (file as any).webkitRelativePath ? (file as any).webkitRelativePath.toLowerCase() : "";
      const searchTxt = `${nameL} ${pathL}`;

      // 1. Min Size check
      if (filterMinSize && file.size < 500 * 1024) {
        cntFilteredSize++;
        continue;
      }

      // 2. SFX Filter
      const sfxKws = ["sfx", "effect", "beep", "ui_", "swipe", "click", "synth", "tick", "sound effect", "sound_effect", "fx", "chirp", "laser", "noise", "explosion"];
      if (filterSFX && sfxKws.some(kw => searchTxt.includes(kw))) {
        cntFilteredSFX++;
        continue;
      }

      // 3. Ringtone Filter
      const ringKws = ["ring", "tone", "alarm", "bell", "ringtone", "dial", "telephone"];
      if (filterRingtones && ringKws.some(kw => searchTxt.includes(kw))) {
        cntFilteredRingtones++;
        continue;
      }

      // 4. Notification Filter
      const notifKws = ["notification", "alert", "ping", "chime", "sms", "notify", "push", "pop", "ding", "message", "whatsapp", "signal"];
      if (filterNotifications && notifKws.some(kw => searchTxt.includes(kw))) {
        cntFilteredNotifications++;
        continue;
      }

      candidates.push(file);
    }

    if (candidates.length === 0) {
      setIsScanning(false);
      setScanResults({
        scanned: cntScanned,
        imported: 0,
        filteredSFX: cntFilteredSFX,
        filteredRingtones: cntFilteredRingtones,
        filteredNotifications: cntFilteredNotifications,
        filteredSize: cntFilteredSize,
        filteredDuration: 0
      });
      setStatusMsg("No tracks imported. All files matched your filters!");
      return;
    }

    setStatusMsg(`Pre-filters passed. Ingesting ${candidates.length} tracks...`);

    // Ingest sequential tracks
    for (let i = 0; i < candidates.length; i++) {
      const file = candidates[i];
      setStatusMsg(`Analyzing audio data: "${file.name}"... (${i + 1}/${candidates.length})`);

      const audioUrl = URL.createObjectURL(file);
      try {
        const tempAudio = new Audio(audioUrl);
        await new Promise<void>((resolve) => {
          tempAudio.onloadedmetadata = async () => {
            try {
              const dur = Math.round(tempAudio.duration) || 180;

              // Duration Filter
              if (filterShortClips && dur < 30) {
                cntFilteredDuration++;
                resolve();
                return;
              }

              let title = "";
              let artist = "";
              let album = "";
              let lyrics = "";
              let coverUrl = "";

              const isLocalOnly = localStorage.getItem("player_local_only") !== "false";

              // Try AI/song extraction Metadata API if online and not in local standalone mode
              if (!isLocalOnly) {
                try {
                  const metaRes = await fetch("/api/collect-song-metadata", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ filename: file.name })
                  });

                  if (metaRes.ok) {
                    const data = await metaRes.json();
                    title = data.title;
                    artist = data.artist;
                    album = data.album;
                    lyrics = data.lyrics;
                    coverUrl = data.coverUrl;
                  }
                } catch (metaErr) {
                  console.error("Metadata API extra error:", metaErr);
                }
              }

              if (!title) {
                const id3Tags = await readID3(file);
                const cleanName = file.name.replace(/\.[^/.]+$/, "");
                const parts = cleanName.split(" - ");

                title = id3Tags.title || parts[1] || parts[0];
                artist = id3Tags.artist || (parts[1] ? parts[0] : "Local Artist");
                album = id3Tags.album || "Local Upload";
                coverUrl = id3Tags.coverUrl || "";
              }

              if (!coverUrl) {
                coverUrl = generateProceduralCoverArt(title, artist);
              }

              let updatedBlob: Blob = file;
              try {
                updatedBlob = await writeID3(file, {
                  title,
                  artist,
                  album,
                  coverUrl
                });
              } catch (tagErr) {
                console.error("Binary ID3 write failure:", tagErr);
              }

              const newTrack: Track = {
                id: `local_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                title,
                artist,
                album,
                lyrics: lyrics || "Instrumental or No lyrics available.",
                duration: dur,
                fileSize: updatedBlob.size,
                blob: updatedBlob,
                coverUrl,
                source: "local",
                createdAt: Date.now(),
              };

              await saveTrack(newTrack);
              cntImported++;
              onTracksUpdated();
              resolve();
            } catch (innerErr) {
              console.error("Track parsing error:", innerErr);
              resolve();
            }
          };

          tempAudio.onerror = () => {
            resolve(); // Skip gracefully on format support issues
          };
        });

      } catch (err) {
        console.error("Recursive file failed to load:", err);
      } finally {
        URL.revokeObjectURL(audioUrl);
      }
    }

    setIsScanning(false);
    setScanResults({
      scanned: cntScanned,
      imported: cntImported,
      filteredSFX: cntFilteredSFX,
      filteredRingtones: cntFilteredRingtones,
      filteredNotifications: cntFilteredNotifications,
      filteredSize: cntFilteredSize,
      filteredDuration: cntFilteredDuration
    });
    setStatusMsg(`Scanning finished! Successfully imported ${cntImported} tracks.`);
    setTimeout(() => setStatusMsg(""), 5500);
  };

  const handleTrackDeleteRequest = (track: Track, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent play action
    setTrackToDelete(track);
  };

  const confirmTrackDelete = async () => {
    if (trackToDelete) {
      await deleteTrack(trackToDelete.id);
      onTracksUpdated();
      setTrackToDelete(null);
      setStatusMsg(`"${trackToDelete.title}" was removed successfully.`);
      setTimeout(() => setStatusMsg(""), 3000);
    }
  };

  const confirmClearLibrary = async () => {
    try {
      setShowClearConfirm(false);
      await clearAllTracks();
      onTracksUpdated();
      setStatusMsg("Offline Library cleared successfully.");
      setTimeout(() => setStatusMsg(""), 3000);
    } catch (err) {
      console.error("Failed to clear library: ", err);
      setStatusMsg("Failed to clear library.");
    }
  };

  // Format Helper
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return "0 MB";
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Dynamic Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Music className="w-6 h-6 text-emerald-400" />
          Music Library
        </h1>
        <p className="text-slate-400 text-xs mt-1">
          Manage and listen to your imported playlist tracks and local offline music files.
        </p>
      </div>

      {statusMsg && (
        <div className="bg-slate-900 border border-emerald-950/40 p-3 rounded-xl flex items-center gap-2 text-xs text-emerald-300 sleek-glass">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-450" />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Library Tracks Listing */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-slate-200 text-sm font-bold uppercase tracking-widest flex items-center gap-1">
            <FileMusic className="w-4 h-4 text-emerald-400" />
            Offline Track Library ({tracks.length})
          </h2>
          {tracks.length > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-xs font-bold text-rose-400 hover:text-rose-350 flex items-center gap-1.5 cursor-pointer bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 px-2.5 py-1 rounded-lg transition-all shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
              <span>Clear Library</span>
            </button>
          )}
        </div>

        {tracks.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-2xl text-center space-y-2">
            <Music className="w-8 h-8 text-slate-700 mx-auto" />
            <h3 className="text-slate-400 text-xs font-semibold">Your Offline Library is Empty</h3>
            <p className="text-slate-600 text-[11px] max-w-sm mx-auto">
              Please load local audio files using the drag-and-drop zone below, or visit the Web Importer to import public playlists!
            </p>
          </div>
        ) : (
          <div className="bg-slate-950/60 border border-slate-900 rounded-2xl overflow-hidden divide-y divide-slate-900/60 shadow-lg">
            {tracks.map((track) => (
              <div key={track.id} className="border-b border-slate-900/40 last:border-0">
                {editingTrackId === track.id ? (
                  <form
                    onSubmit={(e) => handleSaveTags(track, e)}
                    onClick={(e) => e.stopPropagation()}
                    className="p-4 bg-slate-900/90 border-l-4 border-emerald-500 space-y-3 sleek-glass"
                  >
                    <div className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest font-black flex items-center gap-1">
                      <Edit2 className="w-3 h-3 text-emerald-400" />
                      <span>ID3 Tag Editor</span>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mb-1">Track Title</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-semibold"
                          placeholder="e.g. Neon Lights"
                          required
                        />
                      </div>
                      
                      <div>
                        <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mb-1">Artist Name</label>
                        <input
                          type="text"
                          value={editArtist}
                          onChange={(e) => setEditArtist(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-semibold"
                          placeholder="e.g. Retro Wave"
                        />
                      </div>

                      <div>
                        <label className="text-[9px] font-mono text-slate-500 uppercase tracking-wider block mb-1">Album / Collection</label>
                        <input
                          type="text"
                          value={editAlbum}
                          onChange={(e) => setEditAlbum(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg py-1.5 px-3 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-semibold"
                          placeholder="e.g. Neon Horizon"
                        />
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pt-2 border-t border-slate-800/40 text-[10px] font-mono text-slate-500">
                      <div>
                        <span>File: {formatSize(track.fileSize)}</span>
                        <span className="mx-2">•</span>
                        <span>Duration: {formatTime(track.duration)}</span>
                        {track.album && (
                          <>
                            <span className="mx-2">•</span>
                            <span className="text-emerald-500/80">Embedded Header</span>
                          </>
                        )}
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto justify-end">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-755 text-slate-300 font-semibold text-xs cursor-pointer transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingTags}
                          className="px-4 py-1.5 rounded-lg neon-accent text-slate-950 font-black text-xs cursor-pointer flex items-center gap-1 shadow-md shadow-emerald-500/20 hover:opacity-90 transition-opacity"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3] text-slate-955" />
                          <span>Save ID3 Target</span>
                        </button>
                      </div>
                    </div>
                  </form>
                ) : (
                  <div
                    onClick={() => onTrackPlay(track)}
                    className={`flex items-center justify-between p-3 transition-colors cursor-pointer group hover:bg-slate-900/75 ${
                      currentTrackId === track.id ? "bg-slate-900/90 border-l-4 border-emerald-500" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-800 border border-slate-700">
                        {track.coverUrl ? (
                          <img
                            src={track.coverUrl}
                            alt="album art"
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music className="w-4 h-4 text-slate-500" />
                          </div>
                        )}
                        {/* Play Overlay */}
                        <div className="absolute inset-0 bg-slate-950/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <PlayCircle className="w-5 h-5 text-emerald-450" />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <h4 className={`text-xs font-bold truncate ${
                          currentTrackId === track.id ? "text-emerald-450" : "text-slate-200"
                        }`}>
                          {track.title}
                        </h4>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 truncate mt-0.5">
                          <span>{track.artist}</span>
                          {track.album && track.album !== "Local Upload" && (
                            <>
                              <span className="text-slate-700">•</span>
                              <span className="text-slate-600 italic truncate max-w-[100px]">{track.album}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 sm:gap-4 text-[11px] font-mono text-slate-500">
                      <span className="hidden sm:inline bg-slate-900 py-0.5 px-2 rounded-md border border-slate-800 text-[10px]">
                        {track.source === "synthesized" ? "🤖 SYNTH" : "📁 LOCAL"}
                      </span>
                      <span className="hidden sm:inline">{formatSize(track.fileSize)}</span>
                      <span>{formatTime(track.duration)}</span>
                      
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => handleStartEdit(track, e)}
                          className="p-1.5 hover:bg-slate-800 rounded-md text-slate-600 hover:text-emerald-400 transition-colors"
                          title="Edit ID3 Tags"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleTrackDeleteRequest(track, e)}
                          className="p-1.5 hover:bg-slate-800 rounded-md text-slate-600 hover:text-rose-400 transition-colors"
                          title="Remove Track"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Grid Layout: Drag-and-Drop Uploader + Folder Auto-Scanner */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        {/* Usability Pattern Drag-and-Drop Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-300 flex flex-col items-center justify-center min-h-[260px] ${
            isDragging
              ? "border-emerald-400 bg-emerald-950/20 text-emerald-300 scale-[1.01]"
              : "border-slate-800/80 bg-slate-900/20 sleek-glass hover:border-emerald-500 hover:bg-slate-900/40 text-slate-400"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="audio/*"
            multiple
            className="hidden"
          />
          <div className="p-3 bg-slate-800 rounded-2xl mb-3 shadow-md">
            <Upload className="w-7 h-7 text-emerald-450 animate-pulse" />
          </div>
          <h2 className="text-sm font-semibold text-slate-200">Load Music Files</h2>
          <p className="text-xs text-slate-500 max-w-[225px] mt-1.5 leading-relaxed">
            Drag & drop files here or <span className="text-emerald-400 font-bold">browse folders</span> to import. Supports MP3, WAV, M4A, FLAC, OGG, AAC, WEBM, OPUS, etc.
          </p>
          <span className="text-[10px] font-mono mt-3 text-slate-600">Supports offline high-grade audio codecs</span>
        </div>

        {/* Storage Auto-Scanner with Filters */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800/80 p-5 rounded-2xl shadow-xl flex flex-col justify-between sleek-glass">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <HardDrive className="w-4 h-4 text-emerald-450 animate-pulse" />
              <h2 className="text-slate-200 text-sm font-bold uppercase tracking-wider">
                Auto-Scan Storage
              </h2>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed mb-3">
              Scan device folders or mounted storage recursively. Select filters to discard system beeps, alerts, and notifications.
            </p>

            <div className="space-y-1.5 border-t border-slate-800/60 pt-2.5 mb-3">
              <div className="flex items-center justify-between text-[11px] text-slate-300">
                <span className="flex items-center gap-1 font-semibold">
                  <Filter className="w-3 h-3 text-slate-500" /> Filter Rules
                </span>
                <span className="text-[10px] font-mono text-slate-500">Auto-clean</span>
              </div>

              {/* Toggle rules */}
              <label className="flex items-center gap-2 cursor-pointer group py-0.5">
                <input
                  type="checkbox"
                  checked={filterSFX}
                  onChange={(e) => setFilterSFX(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                />
                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                  Filter out Sound Effects (SFX / Beeps)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer group py-0.5">
                <input
                  type="checkbox"
                  checked={filterRingtones}
                  onChange={(e) => setFilterRingtones(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                />
                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                  Filter out Ringtones & Alarms
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer group py-0.5">
                <input
                  type="checkbox"
                  checked={filterNotifications}
                  onChange={(e) => setFilterNotifications(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                />
                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                  Filter out Notifications & SMS Alerts
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer group py-0.5">
                <input
                  type="checkbox"
                  checked={filterShortClips}
                  onChange={(e) => setFilterShortClips(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                />
                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                  Skip short audio clips (&lt; 30s)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer group py-0.5">
                <input
                  type="checkbox"
                  checked={filterMinSize}
                  onChange={(e) => setFilterMinSize(e.target.checked)}
                  className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                />
                <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">
                  Ignore tiny asset files (&lt; 500 KB)
                </span>
              </label>
            </div>

            {/* Folder Select Native Input */}
            <input
              type="file"
              ref={folderInputRef}
              onChange={handleFolderSelect}
              multiple
              {...({ webkitdirectory: "true", directory: "true" } as any)}
              className="hidden"
            />

            <button
              onClick={scanMountedDirectory}
              disabled={isScanning}
              className="w-full bg-slate-950 hover:bg-slate-900 border border-emerald-500/30 hover:border-emerald-500/60 text-emerald-400 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer disabled:opacity-40"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Scanning Folders...</span>
                </>
              ) : (
                <>
                  <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Choose Folder to Scan</span>
                </>
              )}
            </button>
          </div>

          {/* Report summary if preset */}
          {scanResults && (
            <div className="mt-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5 text-[11px] animate-in slide-in-from-bottom-2 duration-300 relative">
              <button 
                onClick={() => setScanResults(null)}
                className="absolute top-1.5 right-1.5 text-slate-650 hover:text-slate-400 transition-colors cursor-pointer"
                title="Dismiss Report"
              >
                <X className="w-3 h-3" />
              </button>
              <div className="font-bold text-slate-200 flex items-center gap-1 text-[10px] uppercase font-mono tracking-wider">
                <Check className="w-3 h-3 text-emerald-450" />
                Scan Report Summary
              </div>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-slate-500 leading-tight">
                <div>Scanned Total: <span className="text-slate-300">{scanResults.scanned}</span></div>
                <div>Imported: <span className="text-emerald-400 font-bold">{scanResults.imported}</span></div>
                {scanResults.filteredSFX > 0 && <div>SFX Auto-ignored: <span className="text-amber-500/90">{scanResults.filteredSFX}</span></div>}
                {scanResults.filteredRingtones > 0 && <div>Ringers Auto-ignored: <span className="text-amber-500/90">{scanResults.filteredRingtones}</span></div>}
                {scanResults.filteredNotifications > 0 && <div>Notifs Auto-ignored: <span className="text-amber-500/90">{scanResults.filteredNotifications}</span></div>}
                {scanResults.filteredSize > 0 && <div>&lt;500KB Tiny: <span className="text-amber-500/90">{scanResults.filteredSize}</span></div>}
                {scanResults.filteredDuration > 0 && <div>&lt;30s Short: <span className="text-amber-500/90">{scanResults.filteredDuration}</span></div>}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* -------------------- IN-APP DIALOG OVERLAYS -------------------- */}
      
      {/* 1. Clear Library Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" id="clear-confirm-modal">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden space-y-4">
            {/* Background warning pattern accent block */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-red-500 to-amber-500" />
            
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-red-500/10 border border-red-900/30 rounded-xl text-red-400 flex-shrink-0">
                <AlertTriangle className="w-6 h-6 animate-pulse" />
              </div>
              <div className="space-y-1 text-left">
                <h3 className="text-sm font-extrabold text-slate-100">Clear Offline Library?</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Are you sure you want to clear your ENTIRE offline track library? This will delete all songs and cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                No, Keep it
              </button>
              <button
                type="button"
                onClick={confirmClearLibrary}
                className="px-4 py-1.5 rounded-xl bg-red-650 hover:bg-red-550 border border-red-900/40 text-slate-100 font-black text-xs cursor-pointer transition-all shadow-md shadow-red-950/20"
              >
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Single Track Removal Confirmation Modal */}
      {trackToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" id="delete-track-modal">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden space-y-4">
            {/* Soft pink safety warning tag */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-pink-500" />
            
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-500/15 border border-rose-900/30 rounded-xl text-rose-400 flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1 min-w-0 text-left">
                <h3 className="text-sm font-extrabold text-slate-100">Remove Track</h3>
                <p className="text-[11px] text-slate-400 truncate font-semibold">"{trackToDelete.title}"</p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Are you sure you want to remove this track from your offline storage library?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setTrackToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmTrackDelete}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-900/40 text-slate-100 font-black text-xs cursor-pointer transition-all shadow-md shadow-rose-950/20"
              >
                Remove Track
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
