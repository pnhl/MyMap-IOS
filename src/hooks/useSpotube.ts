import {useEffect, useSyncExternalStore} from 'react';
import {
  connectSpotube, disconnectSpotube, getSpotubeSnapshot, loadSpotubePreferences,
  nextSpotube, pauseSpotube, playSpotube, previousSpotube, repeatSpotube,
  seekSpotube, shuffleSpotube, stopSpotube, subscribeSpotube,
} from '../services/spotube';

const actions = Object.freeze({
  connect: connectSpotube,
  disconnect: disconnectSpotube,
  play: playSpotube,
  pause: pauseSpotube,
  next: nextSpotube,
  previous: previousSpotube,
  seek: seekSpotube,
  shuffle: shuffleSpotube,
  repeat: repeatSpotube,
  stop: stopSpotube,
});

export function useSpotube() {
  const snapshot = useSyncExternalStore(subscribeSpotube, getSpotubeSnapshot, getSpotubeSnapshot);
  useEffect(() => { void loadSpotubePreferences(); }, []);
  return {...snapshot, ...actions};
}
