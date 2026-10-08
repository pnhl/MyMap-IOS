import {setAudioModeAsync, type AudioRecorder} from 'expo-audio';

// Expo releases the shared recorder during unmount, sometimes before navigation
// cleanup. Reading its native getter or stopping it can then throw synchronously.
export async function stopMomentRecording(recorder: Pick<AudioRecorder, 'isRecording' | 'stop'>): Promise<boolean> {
  let recording = false;
  try {
    recording = recorder.isRecording;
    if (recording) await recorder.stop();
    return recording;
  } catch {
    return false;
  } finally {
    if (recording) await setAudioModeAsync({allowsRecording: false}).catch(() => {});
  }
}
