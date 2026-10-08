import { Accelerometer } from 'expo-sensors';
import { supabase } from './supabase';
import { getCurrentUser } from './auth';

export type BumpState = 'idle' | 'listening' | 'bumped' | 'paired' | 'error';

export type BumpResult = {
  success: boolean;
  friendName?: string;
  message: string;
};

let subscription: any = null;

/**
 * Bắt đầu lắng nghe gia tốc rung để phát hiện cú cụng điện thoại (Bump gesture).
 */
export function startListeningForBump(
  onBumpDetected: () => void,
  thresholdG: number = 2.4
) {
  stopListeningForBump();
  Accelerometer.setUpdateInterval(50); // 20Hz polling for crisp impulse detection

  subscription = Accelerometer.addListener(data => {
    const totalG = Math.sqrt(data.x * data.x + data.y * data.y + data.z * data.z);
    if (totalG >= thresholdG) {
      onBumpDetected();
    }
  });
}

export function stopListeningForBump() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
}

import { getLiveFriends } from './realtimeFriends';
import { validateDualBump } from './hangoutBump';

/**
 * Xử lý kết nối khi phát hiện cú cụng điện thoại:
 * Trao đổi token gần nhau trong 10 giây và tạo sự kiện gặp mặt (Hangout).
 * Loại bỏ trường hợp giả lập thành công khi không có ai ở gần.
 */
export async function performBumpHandshake(coords: { latitude: number; longitude: number }): Promise<BumpResult> {
  const friends = await getLiveFriends().catch(() => []);
  const res = await validateDualBump(coords, friends);

  return {
    success: res.success,
    friendName: res.matchedFriend?.displayName,
    message: res.message,
  };
}
