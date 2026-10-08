import Native from '../../modules/my-map-capabilities';
export function capabilitiesAvailable() { return !!Native; }
export async function authenticateDevice(reason = 'Mở dữ liệu riêng tư của MyMap') {
  if (!Native) throw new Error('Cần bản build có module bảo mật MyMap.');
  return Native.authenticate(reason);
}
export async function encryptPrivate(value: unknown) {
  if (!Native) throw new Error('Thiết bị chưa có module mã hóa.');
  return Native.encrypt(JSON.stringify(value));
}
export async function decryptPrivate<T>(ciphertext: string): Promise<T> {
  if (!Native) throw new Error('Thiết bị chưa có module mã hóa.');
  return JSON.parse(await Native.decrypt(ciphertext)) as T;
}
export async function signProof(text: string) {
  if (!Native) throw new Error('Thiết bị chưa có module chữ ký.');
  return Native.sign(text);
}
export async function speakGuidance(text: string) {
  if (!Native) return false;
  return Native.speak(text, 'vi-VN');
}
export async function stopGuidanceSpeech() { await Native?.stopSpeaking(); }
export async function setPrivateScreen(enabled:boolean){await Native?.setPrivateScreen(enabled);}
