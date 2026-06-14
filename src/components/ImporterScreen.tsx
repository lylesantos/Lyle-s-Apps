import React, { useState, useEffect } from "react";
import { Track, Playlist } from "../types";
import { saveTrack, savePlaylist } from "../lib/db";
import { generateProceduralTrack, generateProceduralCoverArt } from "../lib/AudioSynthesizer";
import { writeID3 } from "../lib/id3";
import { 
  initGoogleAuth, 
  googleSignIn, 
  googleSignOut, 
  fetchDriveAudioFiles, 
  downloadDriveFile, 
  DriveFile 
} from "../lib/googleDrive";

import { 
  Loader2, 
  Sparkles, 
  CheckSquare, 
  Square, 
  Cloud, 
  HardDrive, 
  FolderOpen, 
  LogOut, 
  RefreshCw, 
  Search, 
  CheckCircle2, 
  AlertTriangle 
} from "lucide-react";

interface ImporterScreenProps {
  onTracksUpdated: () => void;
  onNavigateToPlaylists: () => void;
}

type CloudProvider = "gdrive";

const isSupportedAudio = (fileName: string) => {
  const lower = fileName.toLowerCase();
  return [".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac", ".mp4", ".opus"].some(ext => lower.endsWith(ext));
};

export const ImporterScreen: React.FC<ImporterScreenProps> = ({
  onTracksUpdated,
  onNavigateToPlaylists,
}) => {
  // Loading & Progress states
  const [isLoading, setIsLoading] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [errorText, setErrorText] = useState("");

  // Cloud Drives Import states
  const [activeProvider, setActiveProvider] = useState<CloudProvider>("gdrive");
  
  // Real Google Drive states
  const [googleUser, setGoogleUser] = useState<any | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [gdriveFiles, setGdriveFiles] = useState<DriveFile[]>([]);
  const [isSyncingGdrive, setIsSyncingGdrive] = useState(false);
  const [driveSearch, setDriveSearch] = useState("");
  const [selectedDriveFileIds, setSelectedDriveFileIds] = useState<Record<string, boolean>>({});

  // Listen for Google Auth state
  useEffect(() => {
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        fetchGdriveFiles(token);
      },
      () => {
        // Not authenticated
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync and fetch Google Drive files when authorized
  const fetchGdriveFiles = async (token: string) => {
    setIsSyncingGdrive(true);
    setErrorText("");
    try {
      const files = await fetchDriveAudioFiles(token);
      setGdriveFiles(files);
      const defaults: Record<string, boolean> = {};
      files.forEach((f) => {
        defaults[f.id] = false;
      });
      setSelectedDriveFileIds(defaults);
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Failed to fetch files from your Google Drive.");
    } finally {
      setIsSyncingGdrive(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorText("");
    setStatusText("Connecting to Google Secure Portal...");
    try {
      const result = await googleSignIn();
      if (result) {
        setGoogleUser(result.user);
        setGoogleToken(result.accessToken);
        setStatusText("Google Drive authenticated! Syncing files...");
        await fetchGdriveFiles(result.accessToken);
        setStatusText("Google Drive synchronized.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorText(err.message || "Authentication popup dismissed or Google Sign-In failed.");
      setStatusText("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await googleSignOut();
      setGoogleUser(null);
      setGoogleToken(null);
      setGdriveFiles([]);
      setSelectedDriveFileIds({});
      setStatusText("Signed out of Google account.");
    } catch (err: any) {
      console.error(err);
    }
  };

  // Cloud Import Handler (Handles real Google Drive downloads)
  const handleCloudImport = async () => {
    setIsLoading(true);
    setErrorText("");

    if (!googleToken) {
      setErrorText("You must first authorize and connect Google Drive.");
      setIsLoading(false);
      return;
    }

    const fileIdsToImport = Object.keys(selectedDriveFileIds).filter((id) => selectedDriveFileIds[id]);
    if (fileIdsToImport.length === 0) {
      setErrorText("Please select at least one music file from Google Drive to import.");
      setIsLoading(false);
      return;
    }

    const filesToImport = gdriveFiles.filter((f) => fileIdsToImport.includes(f.id));
    const savedTrackIds: string[] = [];

    try {
      for (let i = 0; i < filesToImport.length; i++) {
        const file = filesToImport[i];
        const trackId = `gdrive_${Date.now()}_${i}`;

        setStatusText(`Downloading "${file.name}" from Google Drive... (${i + 1}/${filesToImport.length})`);
        
        let fileBlob: Blob;
        try {
          fileBlob = await downloadDriveFile(googleToken, file.id);
        } catch (dlErr: any) {
          console.error(`Download failed for ${file.name}:`, dlErr);
          setStatusText(`Could not pull direct binary for "${file.name}". Skipping track...`);
          continue;
        }

        setStatusText(`Analyzing filename & crafting lyrics with AI for "${file.name}"...`);
        
        let title = file.name.replace(/\.[^/.]+$/, ""); // strip extension
        let artist = "Google Drive Artist";
        let album = "Google Drive Import";
        let lyrics = "Instrumental or custom Google Cloud transfer.";
        let coverBase64 = "";

        try {
          const metaRes = await fetch("/api/collect-song-metadata", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename: file.name }),
          });

          if (metaRes.ok) {
            const metaData = await metaRes.json();
            if (metaData) {
              if (metaData.title) title = metaData.title;
              if (metaData.artist) artist = metaData.artist;
              if (metaData.album) album = metaData.album;
              if (metaData.lyrics) lyrics = metaData.lyrics;
              if (metaData.coverUrl) coverBase64 = metaData.coverUrl;
            }
          }
        } catch (metaErr) {
          console.error("Failed Google Drive ID3 metadata resolution:", metaErr);
        }

        // Fallback procedural artwork
        if (!coverBase64) {
          coverBase64 = generateProceduralCoverArt(title, artist);
        }

        // Write tags back into download
        try {
          fileBlob = await writeID3(fileBlob, {
            title,
            artist,
            album,
            coverUrl: coverBase64
          });
        } catch (tagErr) {
          console.error("ID3 tagging error:", tagErr);
        }

        const newTrack: Track = {
          id: trackId,
          title,
          artist,
          album,
          duration: 185, // estimated
          fileSize: fileBlob.size,
          blob: fileBlob,
          coverUrl: coverBase64,
          lyrics,
          source: "local",
          createdAt: Date.now()
        };

        await saveTrack(newTrack);
        savedTrackIds.push(trackId);
      }

      if (savedTrackIds.length > 0) {
        // Create Google Drive playlist grouping
        const playlistId = `gdrive_play_${Date.now()}`;
        const newPlaylist: Playlist = {
          id: playlistId,
          name: "Google Drive Syncs",
          description: "Direct lossless music imports downloaded securely from Google Cloud Storage.",
          isImported: true,
          platform: "local",
          trackIds: savedTrackIds,
          coverUrl: generateProceduralCoverArt("Google Drive Syncs", "Google Cloud Storage"),
          createdAt: Date.now()
        };
        await savePlaylist(newPlaylist);
        onTracksUpdated();
        setStatusText(`Successfully imported ${savedTrackIds.length} audio assets!`);
        
        setTimeout(() => {
          onNavigateToPlaylists();
        }, 1500);
      } else {
        setErrorText("Finished syncing. No audio binaries were successfully retrieved.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorText("Critical database storage exception syncing cloud files.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloudSelectAll = (v: boolean) => {
    const updated: Record<string, boolean> = {};
    filteredGDriveFiles.forEach((file) => {
      updated[file.id] = v;
    });
    setSelectedDriveFileIds(updated);
  };

  const toggleSelectDriveFile = (fileId: string) => {
    setSelectedDriveFileIds((prev) => ({
      ...prev,
      [fileId]: !prev[fileId]
    }));
  };

  // Filter GDrive files by search and only show supported audio formats
  const filteredGDriveFiles = gdriveFiles.filter((file) => 
    isSupportedAudio(file.name) && file.name.toLowerCase().includes(driveSearch.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <Cloud className="w-6 h-6 text-emerald-450" />
          Music Cloud Importer
        </h1>
        <p className="text-slate-450 text-xs mt-1">
          Bridge, synchronize, and download media assets from cloud storage or compile virtual modular synthesizers directly into your high-performance browser storage.
        </p>
      </div>

      <div className="space-y-5">
        {/* Drive Panel Core */}
        <div className="bg-slate-900/50 border border-slate-800 p-5 rounded-3xl shadow-lg relative overflow-hidden space-y-4">
          
          {/* GOOGLE DRIVE: AUTHORIZE FLOW */}
          {!googleToken && (
            <div className="flex flex-col items-center justify-center text-center p-8 space-y-4 bg-slate-950/40 rounded-2xl border border-slate-900">
              <Cloud className="w-12 h-12 text-emerald-500 animate-bounce" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-200">Google Drive Offline Sync</h3>
                <p className="text-slate-400 text-xs max-w-md">
                  Securely authorize connection using Firestore OAuth tokens to load, list, and transfer your cloud media directly to offline storage.
                </p>
              </div>

              <button
                id="btn_gdrive_sync"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black py-2.5 px-6 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md shadow-emerald-500/10"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Cloud className="w-4 h-4 text-slate-950" />
                    <span>Synchronize Google Drive</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* GOOGLE DRIVE: MAIN LISTINGS */}
          {googleToken && (
            <div className="space-y-4">
              {/* Connected Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/80 p-3.5 rounded-2xl border border-slate-800/70">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                    <Cloud className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-200 truncate max-w-[180px] sm:max-w-xs">
                      {googleUser?.displayName || "Google Cloud Account"}
                    </p>
                    <p className="text-[10px] text-emerald-500 font-black tracking-widest leading-none mt-0.5">
                      SECURE SYNC ACTIVE
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    id="btn_gdrive_refresh"
                    onClick={() => fetchGdriveFiles(googleToken)}
                    disabled={isSyncingGdrive}
                    className="text-xs text-slate-400 hover:text-slate-200 transition bg-slate-900 border border-slate-800 rounded-lg p-1.5 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    title="Sync Drive Catalog"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncingGdrive ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                  
                  <button
                    id="btn_gdrive_disconnect"
                    onClick={handleGoogleSignOut}
                    className="text-xs text-rose-400 hover:bg-rose-550/10 hover:text-rose-300 transition bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-3 flex items-center gap-1.5 cursor-pointer font-bold"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>

              {/* Filter & Batch controls */}
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Search audio tracks on Google Drive..."
                    value={driveSearch}
                    onChange={(e) => setDriveSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2 pl-9 pr-4 text-xs text-slate-150 focus:outline-none focus:border-emerald-500 placeholder-slate-600"
                  />
                </div>
                
                <div className="flex gap-2.5 flex-shrink-0 w-full sm:w-auto justify-end">
                  <button 
                    onClick={() => handleCloudSelectAll(true)}
                    className="text-[10px] uppercase font-black text-slate-400 hover:text-slate-200 tracking-wider"
                  >
                    Select All
                  </button>
                  <span className="text-slate-850">|</span>
                  <button 
                    onClick={() => handleCloudSelectAll(false)}
                    className="text-[10px] uppercase font-black text-slate-400 hover:text-slate-200 tracking-wider"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* File list container */}
              <div className="space-y-1.5">
                <h3 className="text-slate-400 text-[10px] uppercase font-extrabold tracking-widest block">
                  Discovered Audio Files ({filteredGDriveFiles.length})
                </h3>

                {isSyncingGdrive ? (
                  <div className="flex flex-col items-center justify-center p-8 space-y-2 bg-slate-950/20 rounded-2xl border border-slate-900/60">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                    <span className="text-xs text-slate-400 font-semibold">Indexing Google Drive tracks...</span>
                  </div>
                ) : filteredGDriveFiles.length === 0 ? (
                  <div className="text-center p-8 bg-slate-950/20 rounded-xl border border-slate-900 text-slate-500 text-xs space-y-1">
                    <FolderOpen className="w-8 h-8 text-slate-600 mx-auto mb-1" />
                    <p className="font-bold text-slate-450 text-[11px]">No matching audio files detected.</p>
                    <p className="text-[10px] text-slate-650 max-w-xs mx-auto">Upload .mp3, .wav or .m4a files to Google Drive, then refresh your catalog view.</p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto border border-slate-900 rounded-2xl divide-y divide-slate-900 bg-slate-950/30">
                    {filteredGDriveFiles.map((file) => {
                      const isChecked = !!selectedDriveFileIds[file.id];
                      return (
                        <div
                          key={file.id}
                          id={`file_row_${file.id}`}
                          onClick={() => toggleSelectDriveFile(file.id)}
                          className="flex items-center justify-between p-3 hover:bg-slate-900/65 cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <button className="text-slate-500 hover:text-emerald-400 flex-shrink-0">
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-emerald-400 fill-emerald-950/80" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-200 truncate">{file.name}</p>
                              <p className="text-[10px] text-slate-500 font-medium truncate uppercase tracking-widest mt-0.5">
                                {file._dummyMimeType || file.mimeType.replace("audio/", "")}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-mono font-semibold text-slate-550 flex-shrink-0 ml-3">
                            {file.size ? `${(parseInt(file.size) / (1024 * 1024)).toFixed(1)} MB` : "Stream Data"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Import trigger for Google Drive */}
              <button
                id="btn_submit_cloud_import"
                onClick={handleCloudImport}
                disabled={isLoading || !Object.values(selectedDriveFileIds).some(x => x)}
                className="w-full neon-accent text-slate-950 font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-emerald-500/10 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>Download Selected to Local Storage ({Object.values(selectedDriveFileIds).filter(Boolean).length} Tracks)</span>
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ERROR PANELS */}
      {errorText && (
        <div className="bg-red-500/10 border border-red-900/30 text-rose-400 p-4 rounded-xl text-xs flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">Importer Feedback:</span>
            <p className="text-slate-450 text-[11px]">{errorText}</p>
          </div>
        </div>
      )}

      {/* DYNAMIC PROGRESS POPUPS */}
      {statusText && (
        <div className="bg-slate-900 border border-slate-800/80 p-4 rounded-2xl text-xs text-slate-300 flex items-center gap-3 shadow-md border-emerald-500/10">
          {isLoading || isSyncingGdrive ? (
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-450" />
          )}
          <span className="font-medium">{statusText}</span>
        </div>
      )}

    </div>
  );
};
