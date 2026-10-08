import {createClient} from '@supabase/supabase-js';
import {getCurrentUser} from './auth';
import {getFirebaseIdTokenForUser} from './firebase';
import {SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY} from './supabase';
import {accountError} from '../utils/accountErrors';
/** Pin a token to the account starting this operation, including storage requests. */
export async function accountApi() {
  const user = await getCurrentUser();
  if (!user || user.is_anonymous) throw new Error('Đăng nhập tài khoản để sử dụng tính năng này.');
  const token = await getFirebaseIdTokenForUser(user.id);
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    accessToken: async () => token,
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  async function assertCurrent() { if ((await getCurrentUser())?.id !== user!.id) throw new Error('Tài khoản đã thay đổi.'); }
  await assertCurrent();
  return {owner: user.id, client, assertCurrent};
}
export async function accountRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const api = await accountApi();
  const {data,error} = await api.client.rpc(name,args);
  await api.assertCurrent();
  if (error) throw accountError(error);
  return data as T;
}
