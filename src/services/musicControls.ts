import {useEffect, useSyncExternalStore} from 'react';
import {useMusicPlayback} from '../hooks/useMusicPlayback';
import {useSpotube} from '../hooks/useSpotube';
import {CURATED_RADIO_STATIONS, type FreeRadioStation} from './freeRadio';
import {pauseMusicPlayback, toggleMusicPlayback, nextMusicItem, previousMusicItem, playMusicItem, setMusicStatusOwnership, setMusicSleepTimer, getMusicPlaybackSnapshot, subscribeMusicPlayback} from './musicPlayback';
import {getSpotubeSnapshot, pauseSpotube, playSpotube, nextSpotube, previousSpotube, subscribeSpotube} from './spotube';
import {clearUserMusicStatus, setUserMusicStatus} from './musicStatus';
import type {MusicItem} from './musicLibrary';

export type MusicSource = 'mymap' | 'spotube';
let source: MusicSource = 'mymap';
let transactions: Promise<unknown> = Promise.resolve();
let intentRevision = 0;
let remoteSharingStarted = false;
let remoteSignature = '';
let remoteWrites: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};};
export const getMusicSource = () => source;

function transaction<T>(work: () => Promise<T>): Promise<T> {
  const result = transactions.catch(() => {}).then(work);
  transactions = result;
  return result;
}
export const beginSpotubeConnectionIntent = () => ++intentRevision;

async function selectNow(next: MusicSource) {
  if (next === 'spotube') {
    setMusicStatusOwnership(false);
    await pauseMusicPlayback();
    await setMusicSleepTimer(null);
  } else if (getSpotubeSnapshot().status === 'connected') {
    pauseSpotube();
  }
  if(next === 'spotube')remoteSignature='\u0000';
  source = next;
  setMusicStatusOwnership(next === 'mymap');
  syncRemoteSharing();
  listeners.forEach(listener => listener());
}

export function selectMusicSource(next: MusicSource, expectedRevision?: number): Promise<boolean> {
  if (expectedRevision === undefined) ++intentRevision;
  return transaction(async () => {
    // Approval may arrive after the user has deliberately chosen another source.
    if (expectedRevision !== undefined && expectedRevision !== intentRevision) {
      if(source === 'mymap' && getSpotubeSnapshot().status === 'connected') pauseSpotube();
      return false;
    }
    await selectNow(next);
    return true;
  });
}

export const radioMusicItem = (station: FreeRadioStation): MusicItem => ({
  id: `radio:${station.id}`, kind: 'radio', title: station.name,
  artist: station.country || 'Radio', uri: station.streamUrl, artworkUrl: station.favicon,
});

export function playJourneyMusic(item: MusicItem, queue?: readonly MusicItem[]) {
  ++intentRevision;
  return transaction(async () => {
    await selectNow('mymap');
    await playMusicItem(item, queue ? [...queue] : undefined);
  });
}

export async function toggleJourneyMusic() {
  ++intentRevision;
  return transaction(async () => {
  if (source === 'spotube') {
    const remote = getSpotubeSnapshot();
    if (remote.status !== 'connected') throw new Error('Kết nối Spotube trong mục Âm nhạc để điều khiển phát nhạc.');
    remote.playing ? pauseSpotube() : playSpotube();
    return;
  }
  await toggleMusicPlayback();
  });
}
export async function nextJourneyMusic() {
  ++intentRevision;
  return transaction(async () => {
  if (source === 'spotube') {nextSpotube(); return;}
  await nextMusicItem();
  });
}
export async function previousJourneyMusic() {
  ++intentRevision;
  return transaction(async () => {
  if (source === 'spotube') {previousSpotube(); return;}
  await previousMusicItem();
  });
}
export async function playDefaultJourneyRadio() {
  const queue = CURATED_RADIO_STATIONS.map(radioMusicItem);
  if (queue[0]) await playJourneyMusic(queue[0], queue);
}

function syncRemoteSharing() {
  const local = getMusicPlaybackSnapshot();
  const remote = getSpotubeSnapshot();
  if(source !== 'spotube') {remoteSignature='';return;}
  const track = remote.currentTrack;
  const signature = local.shareNowPlaying && remote.status === 'connected' && remote.playing && track
    ? `${track.id}|${track.name}|${track.artists.join(', ')}|${track.artwork || ''}` : '';
  if(signature === remoteSignature)return;
  remoteSignature = signature;
  remoteWrites = remoteWrites.catch(() => {}).then(async () => {
    if(source !== 'spotube' || signature !== remoteSignature)return;
    if(signature && track) await setUserMusicStatus({isPlaying:true,songTitle:track.name,artistName:track.artists.join(', '),albumCoverUrl:track.artwork});
    else await clearUserMusicStatus();
  });
}

export function useJourneyMusic() {
  const selected = useSyncExternalStore(subscribe, getMusicSource, getMusicSource);
  const local = useMusicPlayback();
  const remote = useSpotube();
  const remoteTitle = remote.currentTrack?.name || '';
  const remoteArtist = remote.currentTrack?.artists.join(', ') || '';
  const remoteArtwork = remote.currentTrack?.artwork || undefined;
  useEffect(() => {
    if(remoteSharingStarted)return;
    remoteSharingStarted=true;
    subscribeMusicPlayback(syncRemoteSharing);
    // Spotube is shared across screens; keep a single metadata publisher.
    subscribeSpotube(syncRemoteSharing);
  }, []);
  return {
    source: selected, local, remote,
    title: selected === 'spotube' ? remoteTitle || 'Spotube trên thiết bị' : local.current?.title || 'Chọn nhạc cho hành trình',
    artist: selected === 'spotube' ? remoteArtist : local.current?.artist || '',
    artwork: selected === 'spotube' ? remoteArtwork : local.current?.artworkUrl,
    playing: selected === 'spotube' ? remote.status === 'connected' && remote.playing : local.playing,
    buffering: selected === 'mymap' && local.buffering,
    position: selected === 'spotube' ? remote.position : local.position,
    duration: selected === 'spotube' ? remote.duration : local.duration,
    canControl: selected === 'mymap' || remote.status === 'connected',
  };
}
