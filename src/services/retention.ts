import AsyncStorage from '@react-native-async-storage/async-storage';
import { purgeLocationPointsOlderThan } from '../db/database';

export type RetentionPeriod = 'forever' | '7_days' | '30_days' | '90_days';

const RETENTION_KEY = 'mymap:retention-policy';

export async function getRetentionPolicy(): Promise<RetentionPeriod> {
  const val = await AsyncStorage.getItem(RETENTION_KEY);
  if (val === '7_days' || val === '30_days' || val === '90_days' || val === 'forever') {
    return val;
  }
  return 'forever';
}

export async function setRetentionPolicy(policy: RetentionPeriod): Promise<void> {
  await AsyncStorage.setItem(RETENTION_KEY, policy);
  await applyRetentionPurge();
}

export async function applyRetentionPurge(): Promise<number> {
  const policy = await getRetentionPolicy();
  if (policy === 'forever') return 0;

  const now = Date.now();
  let days = 30;
  if (policy === '7_days') days = 7;
  if (policy === '30_days') days = 30;
  if (policy === '90_days') days = 90;

  const cutoff = now - days * 86400 * 1000;
  const deleted = await purgeLocationPointsOlderThan(cutoff);
  return deleted;
}
