import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassButton, GlassSurface, glassColors } from '../ui/glass';
import { Text } from '../ui/Text';
import { startListeningForBump, stopListeningForBump, performBumpHandshake, type BumpResult } from '../services/bumpToFriend';

interface BumpModalProps {
  visible: boolean;
  onClose: () => void;
  currentCoords: { latitude: number; longitude: number } | null;
  onFriendAdded?: (name: string) => void;
}

export function BumpModal({ visible, onClose, currentCoords, onFriendAdded }: BumpModalProps) {
  const [status, setStatus] = useState<'listening' | 'bumped' | 'success' | 'error'>('listening');
  const [result, setResult] = useState<BumpResult | null>(null);

  useEffect(() => {
    if (!visible || !currentCoords) {
      stopListeningForBump();
      return;
    }

    setStatus('listening');
    setResult(null);

    startListeningForBump(async () => {
      setStatus('bumped');
      stopListeningForBump();
      const res = await performBumpHandshake(currentCoords);
      setResult(res);
      if (res.success) {
        setStatus('success');
        if (res.friendName && onFriendAdded) {
          onFriendAdded(res.friendName);
        }
      } else {
        setStatus('error');
      }
    });

    return () => {
      stopListeningForBump();
    };
  }, [visible, currentCoords]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <GlassSurface style={s.card}>
          <View style={s.iconWrap}>
            <MaterialCommunityIcons
              name={status === 'success' ? 'account-check' : status === 'bumped' ? 'cellphone-wireless' : 'cellphone-nfc'}
              size={56}
              color={status === 'success' ? '#00FFCC' : status === 'bumped' ? '#FFD700' : glassColors.cyan}
            />
          </View>

          <Text style={s.title}>
            {status === 'listening'
              ? 'Cụng điện thoại để kết bạn'
              : status === 'bumped'
              ? 'Đã phát hiện cú chạm!'
              : status === 'success'
              ? 'Kết nối thành công!'
              : 'Chưa thể kết nối'}
          </Text>

          <Text style={s.body}>
            {status === 'listening'
              ? 'Đưa 2 điện thoại lại gần và chạm nhẹ lưng máy vào nhau để tự động tìm và kết bạn ngay lập tức.'
              : status === 'bumped'
              ? 'Đang gửi tín hiệu bắt tay và trao đổi thông tin bạn bè…'
              : result?.message || 'Hoàn tất kết nối.'}
          </Text>

          {status === 'bumped' && <ActivityIndicator color={glassColors.cyan} size="large" style={{ marginVertical: 8 }} />}

          <GlassButton
            tone={status === 'success' ? 'blue' : 'neutral'}
            onPress={onClose}
            style={{ width: '100%', marginTop: 8 }}
          >
            <Text style={s.btnText}>{status === 'success' ? 'Xong' : 'Đóng'}</Text>
          </GlassButton>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(2,10,32,0.85)' },
  card: { width: '100%', maxWidth: 360, padding: 24, borderRadius: 26, alignItems: 'center', gap: 12 },
  iconWrap: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(82,227,255,0.12)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(82,227,255,0.35)' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  body: { color: '#B3D4F6', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
