import React, { useState } from "react";
import { Playlist, Track } from "../types";
import { savePlaylist, deletePlaylist, saveTrack } from "../lib/db";
import { generateProceduralCoverArt, generateProceduralTrack } from "../lib/AudioSynthesizer";
import { FolderHeart, Trash2, Plus, ArrowLeft, Play, Music, PlusCircle, CheckCircle, ChevronRight, Tags, Share2, Clipboard, Download, Upload, Copy, Link, FileJson, Loader2, AlertTriangle } from "lucide-react";

interface PlaylistsScreenProps {
  playlists: Playlist[];
  tracks: Track[];
  onPlaylistsUpdated: () => void;
  onTrackPlay: (track: Track, parentPlaylist?: Playlist) => void;
  currentTrackId: string | null;
}

export const PlaylistsScreen: React.FC<PlaylistsScreenProps> = ({
  playlists,
  tracks,
  onPlaylistsUpdated,
  onTrackPlay,
  currentTrackId,
}) => {
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDesc, setNewPlaylistDesc] = useState("");
  const [isAddingSong, setIsAddingSong] = useState(false);
  
  // Confirmation state for folder removal
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);

  // Custom sharing and importing states
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [pastedShareCode, setPastedShareCode] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [copiedPlaylistId, setCopiedPlaylistId] = useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const name = newPlaylistName.trim();
    const cover = generateProceduralCoverArt(name, "Offline Player");

    const newPlaylist: Playlist = {
      id: `playlist_${Date.now()}`,
      name,
      description: newPlaylistDesc.trim() || "User defined collections.",
      coverUrl: cover,
      trackIds: [],
      createdAt: Date.now(),
    };

    await savePlaylist(newPlaylist);
    onPlaylistsUpdated();
    setNewPlaylistName("");
    setNewPlaylistDesc("");
    setIsCreating(false);
  };

  const handleDeletePlaylistRequest = (playlist: Playlist, e: React.MouseEvent) => {
    e.stopPropagation();
    setPlaylistToDelete(playlist);
  };

  const confirmPlaylistDelete = async () => {
    if (playlistToDelete) {
      await deletePlaylist(playlistToDelete.id);
      onPlaylistsUpdated();
      if (selectedPlaylistId === playlistToDelete.id) setSelectedPlaylistId(null);
      setPlaylistToDelete(null);
    }
  };

  const handleAddSongToPlaylist = async (trackId: string) => {
    if (!selectedPlaylist) return;

    if (selectedPlaylist.trackIds.includes(trackId)) return;

    const updated: Playlist = {
      ...selectedPlaylist,
      trackIds: [...selectedPlaylist.trackIds, trackId],
    };

    await savePlaylist(updated);
    onPlaylistsUpdated();
  };

  const handleRemoveSongFromPlaylist = async (trackId: string) => {
    if (!selectedPlaylist) return;

    const updated: Playlist = {
      ...selectedPlaylist,
      trackIds: selectedPlaylist.trackIds.filter((id) => id !== trackId),
    };

    await savePlaylist(updated);
    onPlaylistsUpdated();
  };

  const exportPlaylistData = (playlist: Playlist) => {
    const pTracks = playlist.trackIds
      .map(id => tracks.find(t => t.id === id))
      .filter((t): t is Track => !!t)
      .map(t => ({
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        lyrics: t.lyrics,
        source: t.source,
        coverUrl: t.coverUrl
      }));

    return {
      name: playlist.name,
      description: playlist.description,
      platform: playlist.platform,
      isImported: playlist.isImported,
      coverUrl: playlist.coverUrl,
      tracks: pTracks
    };
  };

  const handleCopyShareLink = async (playlist: Playlist, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const data = exportPlaylistData(playlist);
      const jsonStr = JSON.stringify(data);
      const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
      const shareUrl = `${window.location.origin}${window.location.pathname}?share_playlist=${b64}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedPlaylistId(playlist.id);
      setTimeout(() => setCopiedPlaylistId(null), 3000);
    } catch (err) {
      console.error("Failed to generate share link:", err);
      alert("Failed to generate share link. The playlist might contain unsupported complex characters.");
    }
  };

  const handleDownloadPlaylistFile = (playlist: Playlist, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const data = exportPlaylistData(playlist);
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${playlist.name.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_playlist.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download playlist file:", err);
    }
  };

  const importSharedPlaylistData = async (data: any) => {
    setIsImporting(true);
    setImportStatus("Initializing playlist import...");
    try {
      const pTracks = data.tracks || [];
      const savedTrackIds: string[] = [];

      for (let i = 0; i < pTracks.length; i++) {
        const item = pTracks[i];
        setImportStatus(`Synthesizing track "${item.title}"... (${i + 1}/${pTracks.length})`);

        // Check if track is already present in library
        const existing = tracks.find(
          (t) => t.title.toLowerCase() === item.title.toLowerCase() && 
                 t.artist.toLowerCase() === item.artist.toLowerCase()
        );
        if (existing) {
          savedTrackIds.push(existing.id);
          continue;
        }

        // Generate fallbacks
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
          lyrics: item.lyrics || "No lyrics available for this shared track.",
          source: "synthesized",
          createdAt: Date.now()
        };

        await saveTrack(newTrack);
        savedTrackIds.push(newTrack.id);
      }

      const playlistId = `playlist_shared_${Date.now()}`;
      const newPlaylist: Playlist = {
        id: playlistId,
        name: data.name || "Imported List",
        description: data.description || "Imported shared offline collection.",
        trackIds: savedTrackIds,
        coverUrl: data.coverUrl || generateProceduralCoverArt(data.name || "Shared", "Core Network"),
        createdAt: Date.now()
      };

      await savePlaylist(newPlaylist);
      onPlaylistsUpdated();
      setImportStatus("");
      setPastedShareCode("");
      setIsImportOpen(false);
      alert(`Imported "${newPlaylist.name}" with ${savedTrackIds.length} tracks successfully!`);
    } catch (err) {
      console.error("Shared import failed: ", err);
      alert("Failed to parse the share code or playlist file.");
      setImportStatus("");
    } finally {
      setIsImporting(false);
    }
  };

  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && parsed.name && parsed.tracks) {
          await importSharedPlaylistData(parsed);
        } else {
          alert("Selected file is not a valid offline playlist format.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to parse playlist file JSON.");
      }
    };
    reader.readAsText(file);
  };

  const handlePastedImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = pastedShareCode.trim();
    if (!cleanToken) return;

    try {
      let jsonPayload = "";
      // If it's a URL
      if (cleanToken.includes("share_playlist=")) {
        const urlObj = new URL(cleanToken);
        const code = urlObj.searchParams.get("share_playlist");
        if (code) {
          jsonPayload = decodeURIComponent(escape(atob(code)));
        } else {
          throw new Error("Invalid URL token structure");
        }
      } else {
        // Assume direct Base64
        jsonPayload = decodeURIComponent(escape(atob(cleanToken)));
      }

      const parsed = JSON.parse(jsonPayload);
      if (parsed && parsed.name && parsed.tracks) {
        await importSharedPlaylistData(parsed);
      } else {
        alert("Decoded data is not a valid playlist payload.");
      }
    } catch (err) {
      console.error("Failed to decode token:", err);
      alert("Invalid playlist share link or code. Please ensure it was copied correctly.");
    }
  };

  // Get active tracks for detail expansion
  const playlistTracks = selectedPlaylist
    ? selectedPlaylist.trackIds
        .map((id) => tracks.find((t) => t.id === id))
        .filter((t): t is Track => !!t)
    : [];

  // Find tracks not yet in this playlist (for adding)
  const availableSongsToInsert = selectedPlaylist
    ? tracks.filter((t) => !selectedPlaylist.trackIds.includes(t.id))
    : [];

  // Time format helper
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="space-y-6">
      {/* Detail Expansion View */}
      {selectedPlaylist ? (
        <div className="space-y-6">
          {/* Back button */}
          <button
            onClick={() => {
              setSelectedPlaylistId(null);
              setIsAddingSong(false);
            }}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Directories</span>
          </button>

          {/* Playlist Cover / Header */}
          <div className="flex flex-col md:flex-row gap-5 items-center md:items-start justify-between bg-slate-900/40 p-5 rounded-2xl border border-slate-800 sleek-glass">
            <div className="flex flex-col sm:flex-row gap-4 items-center text-center sm:text-left">
              <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-800 border border-slate-700 shadow-lg flex-shrink-0">
                {selectedPlaylist.coverUrl ? (
                  <img
                    src={selectedPlaylist.coverUrl}
                    alt="playlist cover"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FolderHeart className="w-8 h-8 text-slate-600" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-center sm:justify-start gap-1">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    selectedPlaylist.isImported
                      ? selectedPlaylist.platform === "spotify"
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-900"
                        : "bg-rose-950 text-rose-400 border border-rose-900"
                      : "bg-emerald-950/40 text-emerald-400 border border-emerald-950/40"
                  }`}>
                    {selectedPlaylist.isImported ? `${selectedPlaylist.platform} cloud` : "Local Sync"}
                  </span>
                </div>
                <h1 className="text-xl font-extrabold text-slate-100">{selectedPlaylist.name}</h1>
                <p className="text-xs text-slate-400 max-w-sm md:max-w-md">{selectedPlaylist.description}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  {playlistTracks.length} tracks • Created {new Date(selectedPlaylist.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Quick folder action tier */}
            <div className="flex flex-wrap md:flex-col gap-2 w-full md:w-auto justify-center md:items-end">
              <button
                onClick={(e) => handleCopyShareLink(selectedPlaylist, e)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-905 border border-slate-800/80 rounded-xl text-[11px] font-bold text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer w-auto"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>{copiedPlaylistId === selectedPlaylist.id ? "Link Copied!" : "Share Link"}</span>
              </button>

              <button
                onClick={(e) => handleDownloadPlaylistFile(selectedPlaylist, e)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-905 border border-slate-800/80 rounded-xl text-[11px] font-bold text-slate-300 hover:text-emerald-400 transition-colors cursor-pointer w-auto"
              >
                <Download className="w-3.5 h-3.5 text-emerald-500" />
                <span>Export JSON</span>
              </button>

              <button
                onClick={(e) => handleDeletePlaylistRequest(selectedPlaylist, e)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/20 hover:bg-rose-950 hover:text-rose-200 border border-rose-950/40 hover:border-rose-900 rounded-xl text-[11px] font-bold text-rose-450 transition-colors cursor-pointer w-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete List</span>
              </button>
            </div>
          </div>

          {/* Songs index in Expanded Playlist */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-slate-200 text-sm font-bold uppercase tracking-widest flex items-center gap-1.5">
                <Music className="w-4 h-4 text-emerald-400" />
                Tracks
              </h2>

              {!selectedPlaylist.isImported && (
                <button
                  onClick={() => setIsAddingSong(!isAddingSong)}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{isAddingSong ? "Close Selector" : "Add Songs"}</span>
                </button>
              )}
            </div>

            {/* Song insertion selector modal-card (Client-friendly & beautiful) */}
            {isAddingSong && (
              <div className="bg-slate-950 border border-slate-900 p-4 rounded-2xl space-y-3 sleek-glass">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">
                  Library Songs to Insert
                </h3>
                {availableSongsToInsert.length === 0 ? (
                  <p className="text-[11px] text-slate-500 text-center py-2">
                    All songs from your local library are already in this playlist!
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto divide-y divide-slate-900/60 border border-slate-900 rounded-xl bg-slate-900/10">
                    {availableSongsToInsert.map((track) => (
                      <div
                        key={track.id}
                        className="flex items-center justify-between p-2 hover:bg-slate-900/40 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-200 truncate">{track.title}</p>
                          <p className="text-[10px] text-slate-500 truncate">{track.artist}</p>
                        </div>
                        <button
                          onClick={() => handleAddSongToPlaylist(track.id)}
                          className="text-xs font-bold text-emerald-450 hover:text-emerald-300 flex items-center gap-1 cursor-pointer bg-slate-900/85 px-2 py-1 rounded-md"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* List existing tracks */}
            {playlistTracks.length === 0 ? (
              <div className="bg-slate-900/20 border border-slate-800/80 p-8 rounded-2xl text-center space-y-2">
                <Music className="w-8 h-8 text-slate-700 mx-auto" />
                <h3 className="text-slate-400 text-xs font-semibold">Playlist is empty</h3>
                <p className="text-slate-600 text-[11px]">
                  {!selectedPlaylist.isImported
                    ? "Tap 'Add Songs' above to build your list from your local library files."
                    : "No compatible offline-synced track data found for this index."}
                </p>
              </div>
            ) : (
              <div className="bg-slate-950/60 border border-slate-900 rounded-2xl overflow-hidden divide-y divide-slate-900 shadow-inner">
                {playlistTracks.map((track, idx) => (
                  <div
                    key={track.id}
                    onClick={() => onTrackPlay(track, selectedPlaylist)}
                    className={`flex items-center justify-between p-3 transition-colors cursor-pointer group hover:bg-slate-900/70 ${
                      currentTrackId === track.id ? "bg-slate-900 border-l-4 border-emerald-500" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-slate-600 font-mono text-[11px] w-4 text-right">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <h4 className={`text-xs font-bold truncate ${
                          currentTrackId === track.id ? "text-emerald-400" : "text-slate-200"
                        }`}>
                          {track.title}
                        </h4>
                        <p className="text-[10px] text-slate-500 truncate">{track.artist}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-[11px] font-mono text-slate-500">
                      <span>{formatTime(track.duration)}</span>
                      {!selectedPlaylist.isImported && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveSongFromPlaylist(track.id);
                          }}
                          className="p-1 hover:bg-slate-800 rounded-md text-slate-600 hover:text-rose-400 transition-colors"
                          title="Remove Song From Playlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Directories main folder grid layout */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                <FolderHeart className="w-6 h-6 text-emerald-400" />
                Playlists
              </h1>
              <p className="text-slate-400 text-xs mt-1">
                Your offline albums, customized folders, and cloud-synced music folders.
              </p>
            </div>

            <div className="flex gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => setIsImportOpen(!isImportOpen)}
                className="bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-200 py-2 px-4 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4 text-emerald-405" />
                <span>Import Playlist</span>
              </button>

              <button
                onClick={() => setIsCreating(!isCreating)}
                className="neon-accent text-slate-950 py-2 px-4 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg shadow-emerald-500/25"
              >
                <Plus className="w-4 h-4 text-slate-950" />
                <span>Create List</span>
              </button>
            </div>
          </div>

          {/* Quick playlist importer via JSON or Code token */}
          {isImportOpen && (
            <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-2xl shadow-lg sleek-glass space-y-4">
              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 pb-2 border-b border-slate-800/40">
                <div className="flex items-center gap-1.5">
                  <FileJson className="w-4 h-4 text-emerald-405" />
                  <h3 className="text-xs font-extrabold text-slate-200 uppercase tracking-widest">
                    Import Shared Playlist
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-bold text-emerald-400 hover:text-emerald-350 flex items-center gap-1 bg-slate-950 py-1.5 px-3 rounded-lg border border-slate-805/65 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Choose JSON File</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleJsonUpload}
                  accept=".json"
                  className="hidden"
                />
              </div>

              <form onSubmit={handlePastedImport} className="space-y-3">
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Paste a playlist share link, a base64 share code, or upload an exported <code>.json</code> file above. The engine will verify tracks and generate native high-fidelity audio binaries for offline playback immediately.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={pastedShareCode}
                    onChange={(e) => setPastedShareCode(e.target.value)}
                    placeholder="Paste share link, URL, or code token..."
                    className="flex-1 bg-slate-955 border border-slate-800 rounded-xl py-2 px-3 text-xs text-slate-100 placeholder-slate-650 focus:outline-none focus:border-emerald-500"
                    disabled={isImporting}
                  />
                  <button
                    type="submit"
                    disabled={isImporting || !pastedShareCode.trim()}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-955 font-extrabold py-2 px-4 rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 flex-shrink-0"
                  >
                    {isImporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-955" />
                    ) : (
                      <>
                        <CheckCircle className="w-3.5 h-3.5 text-slate-955" />
                        <span>Confirm Import</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {importStatus && (
            <div className="bg-slate-900 border border-emerald-950/40 p-4 rounded-xl flex items-center gap-2 text-xs text-emerald-300 sleek-glass">
              <Loader2 className="w-4.5 h-4.5 animate-spin text-emerald-450" />
              <span>{importStatus}</span>
            </div>
          )}

          {/* Quick inline playlist builder */}
          {isCreating && (
            <div className="bg-slate-900/50 border border-slate-850 p-4 rounded-2xl shadow-lg sleek-glass">
              <form onSubmit={handleCreatePlaylist} className="space-y-3">
                <h3 className="text-xs font-extrabold text-slate-300 uppercase tracking-widest">
                  Create Custom Playlist
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    required
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="e.g. Morning Focus Synth"
                    className="bg-slate-955 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={newPlaylistDesc}
                    onChange={(e) => setNewPlaylistDesc(e.target.value)}
                    placeholder="e.g. Gentle retro chords for work"
                    className="bg-slate-955 border border-slate-800 rounded-xl py-1.5 px-3 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="flex justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-3.5 py-1.5 text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="neon-accent text-slate-950 font-black py-1.5 px-4 rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    Save Folder
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Playlists grid */}
          {playlists.length === 0 ? (
            <div className="bg-slate-900/10 border border-slate-850 p-12 rounded-2xl text-center space-y-2">
              <FolderHeart className="w-10 h-10 text-slate-800 mx-auto" />
              <h3 className="text-slate-400 text-xs font-semibold">No folders found</h3>
              <p className="text-slate-600 text-[11px] max-w-sm mx-auto">
                Build folders using the "Create List" tool above or convert public playlist shares instantly under the Web Importer tab.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {playlists.map((playlist) => (
                <div
                  key={playlist.id}
                  onClick={() => setSelectedPlaylistId(playlist.id)}
                  className="group bg-slate-950/70 border border-slate-900 rounded-2xl p-3.5 flex items-center justify-between gap-3 hover:border-slate-800 hover:bg-slate-900/60 transition-all cursor-pointer shadow-md"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-slate-800 border border-slate-755 shadow-md flex-shrink-0">
                      {playlist.coverUrl ? (
                        <img
                          src={playlist.coverUrl}
                          alt="art"
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <FolderHeart className="w-6 h-6 text-slate-500" />
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-slate-200 truncate group-hover:text-emerald-400 transition-colors">
                          {playlist.name}
                        </h3>
                        {playlist.isImported && (
                          <span className={`text-[8px] px-1 rounded-sm uppercase ${
                            playlist.platform === "spotify" ? "bg-emerald-950 text-emerald-400" : "bg-rose-950 text-rose-400"
                          }`}>
                            {playlist.platform}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate mt-0.5 leading-relaxed">
                        {playlist.description || "Collection"}
                      </p>
                      <span className="text-[9px] font-mono font-medium text-slate-600 block mt-1">
                        {playlist.trackIds.length} SONGS
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleCopyShareLink(playlist, e)}
                      className="p-2 hover:bg-slate-850 rounded-lg text-slate-600 hover:text-emerald-400 transition-colors"
                      title="Copy Share Link"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDeletePlaylistRequest(playlist, e)}
                      className="p-2 hover:bg-slate-850 rounded-lg text-slate-600 hover:text-rose-450 transition-colors"
                      title="Delete Folder"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <ChevronRight 
                      onClick={() => setSelectedPlaylistId(playlist.id)}
                      className="w-4 h-4 text-slate-600 group-hover:text-slate-400 group-hover:translate-x-0.5 transition-all cursor-pointer shadow-sm" 
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 3. Playlist / Folder Deletion Confirmation Modal */}
      {playlistToDelete && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200" id="delete-playlist-modal">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative overflow-hidden space-y-4">
            {/* Elegant safety visual line mark */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-rose-500 to-amber-500" />
            
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-500/10 border border-rose-900/30 rounded-xl text-rose-400 flex-shrink-0 animate-pulse">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1 text-left">
                <h3 className="text-sm font-extrabold text-slate-100">Delete Playlist Folder?</h3>
                <p className="text-[11px] text-slate-400 font-semibold">"{playlistToDelete.name}"</p>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Are you sure you want to delete this folder? All individual tracks will remain safe in your offline track library.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPlaylistToDelete(null)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-755 text-slate-300 font-bold text-xs cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPlaylistDelete}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 border border-rose-900/40 text-slate-100 font-black text-xs cursor-pointer transition-all shadow-md shadow-rose-950/20"
              >
                Delete Folder
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
