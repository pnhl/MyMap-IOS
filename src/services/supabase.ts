import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';
import { getFirebaseIdToken } from './firebase';

export const SUPABASE_URL = env.supabaseUrl || 'https://not-configured.invalid';
export const SUPABASE_PUBLISHABLE_KEY =
  env.supabasePublishableKey || 'not-configured';
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  // Firebase Authentication is the primary identity provider. Supabase verifies
  // this token through its Third-party Auth integration.
  accessToken: getFirebaseIdToken,
  auth: { storage: AsyncStorage, autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

/**
 * Gọi Edge Function với cơ chế dự phòng tự động giữa tên mới (mymap-*) và tên cũ (vibecoding-*).
 */
export async function invokeEdgeFunctionWithFallback(
  primaryName: string,
  fallbackName: string,
  options?: any
) {
  try {
    const res = await supabase.functions.invoke(primaryName, options);
    if (res.error && (res.error.message?.includes('not found') || (res.error as any).status === 404)) {
      return await supabase.functions.invoke(fallbackName, options);
    }
    return res;
  } catch {
    return await supabase.functions.invoke(fallbackName, options);
  }
}
