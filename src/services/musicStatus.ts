import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserMusicStatus {
  isPlaying: boolean;
  songTitle: string;
  artistName: string;
  albumCoverUrl?: string | null;
  updatedAt: number;
}

const MUSIC_STATUS_KEY = 'mymap.user_music_status.v1';

export async function getUserMusicStatus(): Promise<UserMusicStatus | null> {
  try {
    const raw = await AsyncStorage.getItem(MUSIC_STATUS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export async function setUserMusicStatus(status: {
  songTitle: string;
  artistName: string;
  isPlaying: boolean;
  albumCoverUrl?: string | null;
}): Promise<UserMusicStatus> {
  const data: UserMusicStatus = {
    ...status,
    updatedAt: Date.now(),
  };
  await AsyncStorage.setItem(MUSIC_STATUS_KEY, JSON.stringify(data)).catch(() => {});
  return data;
}

export async function togglePlayback(): Promise<UserMusicStatus | null> {
  const current = await getUserMusicStatus();
  if (!current) return null;
  const updated: UserMusicStatus = {
    ...current,
    isPlaying: !current.isPlaying,
    updatedAt: Date.now(),
  };
  await AsyncStorage.setItem(MUSIC_STATUS_KEY, JSON.stringify(updated)).catch(() => {});
  return updated;
}

export function formatMusicForBroadcast(status: UserMusicStatus | null): {
  musicTitle?: string;
  musicArtist?: string;
} {
  if (!status || !status.isPlaying) return {};
  return {
    musicTitle: status.songTitle,
    musicArtist: status.artistName,
  };
}

export const setMusicTrack = (track: {
  songTitle: string;
  artist?: string;
  artistName?: string;
  isPlaying: boolean;
  albumCoverUrl?: string | null;
}) =>
  setUserMusicStatus({
    songTitle: track.songTitle,
    artistName: track.artist || track.artistName || '',
    isPlaying: track.isPlaying,
    albumCoverUrl: track.albumCoverUrl,
  });

export const getCurrentMusicStatus = getUserMusicStatus;

export async function clearUserMusicStatus(): Promise<void> {
  await AsyncStorage.removeItem(MUSIC_STATUS_KEY).catch(() => {});
}
