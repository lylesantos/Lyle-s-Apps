import { Track, Playlist } from "../types";

const DB_NAME = "AndroidMP3PlayerDB";
const DB_VERSION = 1;

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB failed to open");
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      
      // Store tracks: contains blob binary, lyrics, title, coverUrl representation
      if (!db.objectStoreNames.contains("tracks")) {
        db.createObjectStore("tracks", { keyPath: "id" });
      }

      // Store playlists
      if (!db.objectStoreNames.contains("playlists")) {
        db.createObjectStore("playlists", { keyPath: "id" });
      }

      // Store key-value settings / playback logs
      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings");
      }
    };
  });
}

// Low-level helper functions
function getStore(storeName: "tracks" | "playlists" | "settings", mode: IDBTransactionMode): Promise<{ store: IDBObjectStore, transaction: IDBTransaction }> {
  return initDB().then((db) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    return { store, transaction };
  });
}

// Tracks Store operations
export function getAllTracks(): Promise<Track[]> {
  return new Promise((resolve, reject) => {
    getStore("tracks", "readonly")
      .then(({ store }) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

export function saveTrack(track: Track): Promise<void> {
  return new Promise((resolve, reject) => {
    getStore("tracks", "readwrite")
      .then(({ store }) => {
        const request = store.put(track);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

export function deleteTrack(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getStore("tracks", "readwrite")
      .then(({ store }) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

// Playlists Store operations
export function getAllPlaylists(): Promise<Playlist[]> {
  return new Promise((resolve, reject) => {
    getStore("playlists", "readonly")
      .then(({ store }) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

export function savePlaylist(playlist: Playlist): Promise<void> {
  return new Promise((resolve, reject) => {
    getStore("playlists", "readwrite")
      .then(({ store }) => {
        const request = store.put(playlist);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

export function deletePlaylist(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    getStore("playlists", "readwrite")
      .then(({ store }) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

export function clearAllTracks(): Promise<void> {
  return new Promise((resolve, reject) => {
    getStore("tracks", "readwrite")
      .then(({ store }) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

// Key-Value App settings
export function getSetting<T>(key: string): Promise<T | null> {
  return new Promise((resolve, reject) => {
    getStore("settings", "readonly")
      .then(({ store }) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result !== undefined ? request.result : null);
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

export function saveSetting<T>(key: string, value: T): Promise<void> {
  return new Promise((resolve, reject) => {
    getStore("settings", "readwrite")
      .then(({ store }) => {
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      })
      .catch(reject);
  });
}

// Automatically detect and delete duplicate tracks based on title and artist, remapping playlist records
export async function autoDeduplicateTracks(): Promise<number> {
  const tracks = await getAllTracks();
  const seen = new Map<string, Track>();
  const toDelete = new Map<string, string>(); // maps deleted_id -> kept_id

  // Sort tracks: prefer 'local' offline files, then larger file sizes, then newer creation time
  const sortedTracks = [...tracks].sort((a, b) => {
    if (a.source === "local" && b.source !== "local") return -1;
    if (b.source === "local" && a.source !== "local") return 1;
    if ((a.fileSize || 0) !== (b.fileSize || 0)) {
      return (b.fileSize || 0) - (a.fileSize || 0);
    }
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  for (const track of sortedTracks) {
    if (!track.title || !track.artist) continue;
    const key = `${track.title.trim().toLowerCase()} - ${track.artist.trim().toLowerCase()}`;
    const existing = seen.get(key);
    if (existing) {
      toDelete.set(track.id, existing.id);
    } else {
      seen.set(key, track);
    }
  }

  if (toDelete.size > 0) {
    console.log(`[Auto-Deduplication] Detected and cleaning ${toDelete.size} duplicate music matches.`);
    for (const deleteId of toDelete.keys()) {
      await deleteTrack(deleteId);
    }

    // Remap track references in playlists gracefully
    try {
      const playlists = await getAllPlaylists();
      for (const pl of playlists) {
        let modified = false;
        const newTrackIds: string[] = [];
        for (const tid of pl.trackIds) {
          if (toDelete.has(tid)) {
            const replacementId = toDelete.get(tid)!;
            if (!newTrackIds.includes(replacementId)) {
              newTrackIds.push(replacementId);
            }
            modified = true;
          } else {
            if (!newTrackIds.includes(tid)) {
              newTrackIds.push(tid);
            }
          }
        }
        if (modified) {
          pl.trackIds = newTrackIds;
          await savePlaylist(pl);
        }
      }
    } catch (plErr) {
      console.error("[Auto-Deduplication] Failure updating playlists: ", plErr);
    }
  }

  return toDelete.size;
}

