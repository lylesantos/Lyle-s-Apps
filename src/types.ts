export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  fileSize?: number; // size in bytes (for local files)
  blob?: Blob; // raw audio binary stored in IndexedDB (for complete offline playback!)
  coverUrl?: string; // custom abstract CSS gradient, standard base64 from ID3, or default
  lyrics?: string;
  source: 'local' | 'synthesized' | 'sample';
  createdAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  isImported?: boolean;
  platform?: 'spotify' | 'apple' | 'local';
  trackIds: string[]; // List of Track IDs
  createdAt: number;
}

export interface EQSettings {
  bass: number; // -12 to +12 dB
  mid: number;  // -12 to +12 dB
  treble: number; // -12 to +12 dB
  presetName: string;
}

export interface PlaybackState {
  currentTrackId: string | null;
  isPlaying: boolean;
  progress: number; // in seconds
  volume: number; // 0 to 1
  isMuted: boolean;
  isShuffle: boolean;
  isRepeat: 'none' | 'all' | 'one';
}

export interface UserProfile {
  email: string;
  displayName: string;
  avatarUrl?: string;
  isLoggedIn: boolean;
  provider: 'email' | 'google' | 'apple' | 'none';
}



