import { useEffect, useSyncExternalStore } from 'react';
import { getMusicPlaybackSnapshot, initializeMusicPlayback, subscribeMusicPlayback } from '../services/musicPlayback';

export function useMusicPlayback() {
  useEffect(() => { void initializeMusicPlayback(); }, []);
  return useSyncExternalStore(subscribeMusicPlayback, getMusicPlaybackSnapshot, getMusicPlaybackSnapshot);
}
