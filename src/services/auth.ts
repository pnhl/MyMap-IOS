import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  AppleAuthProvider,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously as firebaseSignInAnonymously,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPhoneNumber,
  signOut,
  updateProfile,
  type AuthError,
  type ConfirmationResult,
} from '@react-native-firebase/auth';
import {
  firebaseAuth,
  firebaseSession,
  firebaseUserAsAppUser,
  waitForFirebaseAuth,
} from './firebase';
import MyMapGameCenter from '../../modules/my-map-game-center';

export interface AuthResult {
  user: User | null;
  session: Session | null;
  error?: string | null;
}

export const OAUTH_CALLBACK_URL = 'mymap://auth/callback';
const EMAIL_LINK_KEY = 'mymap:firebase-email-link-address';
let phoneConfirmation: ConfirmationResult | null = null;

function authErrorMessage(error: unknown, fallback: string): string {
  const authError = error as Partial<AuthError> | undefined;
  switch (authError?.code) {
    case 'auth/invalid-email':
      return 'Địa chỉ email không hợp lệ.';
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Email hoặc mật khẩu không đúng.';
    case 'auth/email-already-in-use':
      return 'Email này đã có tài khoản Firebase.';
    case 'auth/weak-password':
      return 'Mật khẩu chưa đáp ứng chính sách bảo mật của Firebase.';
    case 'auth/user-disabled':
      return 'Tài khoản đã bị vô hiệu hóa.';
    case 'auth/too-many-requests':
      return 'Có quá nhiều lần thử. Hãy đợi một lúc rồi đăng nhập lại.';
    case 'auth/network-request-failed':
      return 'Không thể kết nối Firebase. Hãy kiểm tra mạng và thử lại.';
    case 'auth/operation-not-allowed':
      return 'Phương thức đăng nhập này chưa được bật trong Firebase Authentication.';
    case 'auth/configuration-not-found':
      return 'Firebase Authentication chưa được khởi tạo cho project mymap-a3ae4. Hãy bật Authentication trong Firebase Console.';
    case 'auth/admin-restricted-operation':
      return 'Đăng nhập khách chưa được bật trong Firebase Authentication.';
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
      return 'Liên kết đăng nhập đã hết hạn hoặc không còn hợp lệ.';
    case 'auth/invalid-phone-number':
      return 'Số điện thoại không hợp lệ. Hãy dùng định dạng quốc tế, ví dụ +84901234567.';
    case 'auth/invalid-verification-code':
      return 'Mã OTP không đúng hoặc đã hết hạn.';
    case 'auth/quota-exceeded':
      return 'Đã vượt giới hạn gửi SMS của Firebase. Hãy thử lại sau.';
    case 'auth/missing-client-identifier':
      return 'Thiếu OAuth client cho ứng dụng này. Hãy cập nhật cấu hình Firebase và rebuild.';
    default:
      return authError?.message || fallback;
  }
}

async function currentResult(): Promise<AuthResult> {
  // Force a fresh native Firebase token after sign-in so Supabase receives the
  // latest subject/provider metadata on the first data request.
  const session = await firebaseSession(true);
  return { user: session?.user ?? null, session, error: null };
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    await waitForFirebaseAuth();
    return firebaseAuth.currentUser ? firebaseUserAsAppUser(firebaseAuth.currentUser) : null;
  } catch {
    return null;
  }
}

export async function getCurrentSession(): Promise<Session | null> {
  try {
    return await firebaseSession();
  } catch {
    return null;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !password) {
    return { user: null, session: null, error: 'Vui lòng nhập đầy đủ email và mật khẩu.' };
  }
  try {
    await signInWithEmailAndPassword(firebaseAuth, cleanEmail, password);
    return currentResult();
  } catch (error) {
    return { user: null, session: null, error: authErrorMessage(error, 'Không thể đăng nhập Firebase.') };
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  fullName?: string,
): Promise<AuthResult> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName?.trim();
  if (!cleanEmail || !password) {
    return { user: null, session: null, error: 'Vui lòng nhập email và mật khẩu.' };
  }
  if (password.length < 6) {
    return { user: null, session: null, error: 'Mật khẩu cần tối thiểu 6 ký tự.' };
  }
  try {
    const credential = await createUserWithEmailAndPassword(firebaseAuth, cleanEmail, password);
    if (cleanName) await updateProfile(credential.user, { displayName: cleanName });
    await sendEmailVerification(credential.user).catch(() => undefined);
    return currentResult();
  } catch (error) {
    return { user: null, session: null, error: authErrorMessage(error, 'Không thể tạo tài khoản Firebase.') };
  }
}

export async function signInAnonymously(): Promise<AuthResult> {
  try {
    await firebaseSignInAnonymously(firebaseAuth);
    return currentResult();
  } catch (error) {
    return { user: null, session: null, error: authErrorMessage(error, 'Không thể đăng nhập khách Firebase.') };
  }
}

export async function signInWithGoogleToken(
  idToken: string,
  accessToken?: string | null,
): Promise<AuthResult> {
  if (!idToken) {
    return { user: null, session: null, error: 'Google không trả về ID token hợp lệ.' };
  }
  try {
    const credential = GoogleAuthProvider.credential(idToken, accessToken);
    await signInWithCredential(firebaseAuth, credential);
    return currentResult();
  } catch (error) {
    return { user: null, session: null, error: authErrorMessage(error, 'Không thể đăng nhập bằng Google.') };
  }
}

export async function signInWithApple(): Promise<AuthResult> {
  try {
    if (!(await AppleAuthentication.isAvailableAsync())) {
      return { user: null, session: null, error: 'Sign in with Apple chỉ khả dụng trên thiết bị Apple được hỗ trợ.' };
    }
    const rawNonce = Crypto.randomUUID().replace(/-/g, '');
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );
    const apple = await AppleAuthentication.signInAsync({
      nonce: hashedNonce,
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!apple.identityToken) {
      return { user: null, session: null, error: 'Apple không trả về identity token.' };
    }
    const credential = AppleAuthProvider.credential(apple.identityToken, rawNonce);
    const result = await signInWithCredential(firebaseAuth, credential);
    const displayName = apple.fullName
      ? [apple.fullName.givenName, apple.fullName.familyName].filter(Boolean).join(' ')
      : '';
    if (displayName && !result.user.displayName) {
      await updateProfile(result.user, { displayName }).catch(() => undefined);
    }
    return currentResult();
  } catch (error) {
    if ((error as { code?: string })?.code === 'ERR_REQUEST_CANCELED') {
      return { user: null, session: null, error: 'Bạn đã hủy đăng nhập bằng Apple.' };
    }
    return { user: null, session: null, error: authErrorMessage(error, 'Không thể đăng nhập bằng Apple.') };
  }
}

export async function sendPhoneCode(phoneNumber: string): Promise<{ success: boolean; error?: string | null }> {
  const cleanPhone = phoneNumber.replace(/[\s()-]/g, '');
  if (!/^\+[1-9][0-9]{6,14}$/.test(cleanPhone)) {
    return { success: false, error: 'Nhập số điện thoại quốc tế, ví dụ +84901234567.' };
  }
  try {
    phoneConfirmation = await signInWithPhoneNumber(firebaseAuth, cleanPhone);
    return { success: true, error: null };
  } catch (error) {
    phoneConfirmation = null;
    return { success: false, error: authErrorMessage(error, 'Không thể gửi mã OTP Firebase.') };
  }
}

export async function confirmPhoneCode(code: string): Promise<AuthResult> {
  const cleanCode = code.replace(/\s/g, '');
  if (!phoneConfirmation) {
    return { user: null, session: null, error: 'Hãy yêu cầu gửi mã OTP trước.' };
  }
  if (!/^[0-9]{6}$/.test(cleanCode)) {
    return { user: null, session: null, error: 'Mã OTP phải gồm 6 chữ số.' };
  }
  try {
    await phoneConfirmation.confirm(cleanCode);
    phoneConfirmation = null;
    return currentResult();
  } catch (error) {
    return { user: null, session: null, error: authErrorMessage(error, 'Không thể xác nhận mã OTP.') };
  }
}

export async function signInWithGameCenter(): Promise<AuthResult> {
  if (!MyMapGameCenter?.signIn) {
    return { user: null, session: null, error: 'Game Center chỉ khả dụng trong bản build iOS native.' };
  }
  try {
    await MyMapGameCenter.signIn();
    return currentResult();
  } catch (error) {
    return { user: null, session: null, error: authErrorMessage(error, 'Không thể đăng nhập bằng Game Center.') };
  }
}

export async function signInWithMagicLink(email: string): Promise<{ success: boolean; error?: string | null }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Vui lòng nhập địa chỉ email hợp lệ.' };
  }
  await AsyncStorage.setItem(EMAIL_LINK_KEY, cleanEmail);
  return {
    success: false,
    error: 'Đăng nhập bằng liên kết cần Firebase Hosting/Universal Link. Hãy dùng mật khẩu trong bản build hiện tại.',
  };
}

export async function sendPasswordReset(email: string): Promise<{ success: boolean; error?: string | null }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'Vui lòng nhập địa chỉ email hợp lệ.' };
  }
  try {
    await sendPasswordResetEmail(firebaseAuth, cleanEmail);
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error: authErrorMessage(error, 'Không thể gửi email đặt lại mật khẩu.') };
  }
}

export function parseAuthParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!url) return params;
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const queryString = hashIndex !== -1
    ? url.substring(hashIndex + 1)
    : queryIndex !== -1
      ? url.substring(queryIndex + 1)
      : '';
  if (!queryString) return params;
  for (const pair of queryString.split('&')) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const rawKey = pair.substring(0, eqIdx).trim();
    const rawVal = pair.substring(eqIdx + 1).trim();
    try {
      params[decodeURIComponent(rawKey)] = decodeURIComponent(rawVal.replace(/\+/g, ' '));
    } catch {
      params[rawKey] = rawVal;
    }
  }
  return params;
}

export async function handleAuthUrl(url: string): Promise<AuthResult> {
  try {
    if (!isSignInWithEmailLink(firebaseAuth, url)) {
      const params = parseAuthParams(url);
      const error = params.error_description || params.error;
      return { user: null, session: null, error: error || 'Liên kết không phải callback Firebase hợp lệ.' };
    }
    const email = await AsyncStorage.getItem(EMAIL_LINK_KEY);
    if (!email) {
      return { user: null, session: null, error: 'Cần nhập lại email để xác nhận liên kết đăng nhập.' };
    }
    await signInWithEmailLink(firebaseAuth, email, url);
    await AsyncStorage.removeItem(EMAIL_LINK_KEY);
    return currentResult();
  } catch (error) {
    return { user: null, session: null, error: authErrorMessage(error, 'Không thể xử lý callback Firebase.') };
  }
}

export async function signOutUser(): Promise<{ error?: string | null }> {
  try {
    await signOut(firebaseAuth);
    return { error: null };
  } catch (error) {
    return { error: authErrorMessage(error, 'Không thể đăng xuất Firebase.') };
  }
}

export function subscribeAuthState(callback: (event: string, session: Session | null) => void) {
  let wasSignedIn = Boolean(firebaseAuth.currentUser);
  return onAuthStateChanged(firebaseAuth, user => {
    if (!user) {
      const event = wasSignedIn ? 'SIGNED_OUT' : 'INITIAL_SESSION';
      wasSignedIn = false;
      callback(event, null);
      return;
    }
    const event = wasSignedIn ? 'TOKEN_REFRESHED' : 'SIGNED_IN';
    wasSignedIn = true;
    void firebaseSession().then(session => callback(event, session));
  });
}
