import {useEffect, useSyncExternalStore} from 'react';
import {extensionSnapshot, initializeExtensions, subscribeExtensions} from '../services/extensionPreferences';
export function useExtensions() {
  useEffect(() => { void initializeExtensions(); }, []);
  return useSyncExternalStore(subscribeExtensions, extensionSnapshot, extensionSnapshot);
}
