import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Vibration, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface, glassColors, type IconName } from '../ui/glass';
import { Text } from '../ui/Text';
import type { RealtimeFriend } from '../services/realtimeFriends';

interface InteractionWheelProps {
  friend: RealtimeFriend | null;
  visible: boolean;
  onClose: () => void;
  onPeek: (friend: RealtimeFriend) => void;
  onSendHeart: (friend: RealtimeFriend) => void;
  onInviteHangout: (friend: RealtimeFriend) => void;
  onBuzz: (friend: RealtimeFriend) => void;
  onOpenChat: (friend: RealtimeFriend) => void;
  onNavigate: (friend: RealtimeFriend) => void;
  onNotifyArrival: (friend: RealtimeFriend) => void;
  onOpenFullDetail: (friend: RealtimeFriend) => void;
  onEmojiBomb?: (friend: RealtimeFriend) => void;
  onVoicePing?: (friend: RealtimeFriend) => void;
  onARFinder?: (friend: RealtimeFriend) => void;
}

interface ActionItem {
  id: string;
  icon: IconName;
  label: string;
  color: string;
  onPress: () => void;
}

export function InteractionWheel({
  friend,
  visible,
  onClose,
  onPeek,
  onSendHeart,
  onInviteHangout,
  onBuzz,
  onOpenChat,
  onNavigate,
  onNotifyArrival,
  onOpenFullDetail,
  onEmojiBomb,
  onVoicePing,
  onARFinder,
}: InteractionWheelProps) {
  if (!friend) return null;

  const actions: ActionItem[] = [
    {
      id: 'peek',
      icon: 'eye-outline',
      label: 'Đang xem bạn',
      color: '#48E3FF',
      onPress: () => {
        Vibration.vibrate(50);
        onPeek(friend);
        onClose();
      },
    },
    {
      id: 'heart',
      icon: 'heart',
      label: 'Gửi tim',
      color: '#FF3366',
      onPress: () => {
        Vibration.vibrate([0, 80, 50, 100]);
        onSendHeart(friend);
      },
    },
    {
      id: 'invite',
      icon: 'glass-mug-variant',
      label: 'Rủ đi chơi',
      color: '#FFD700',
      onPress: () => {
        Vibration.vibrate(60);
        onInviteHangout(friend);
        onClose();
      },
    },
    {
      id: 'buzz',
      icon: 'vibrate',
      label: 'Buzz rung máy',
      color: '#FF9A3C',
      onPress: () => {
        Vibration.vibrate([0, 120, 80, 150]);
        onBuzz(friend);
      },
    },
    {
      id: 'chat',
      icon: 'chat-processing-outline',
      label: 'Ghim tin',
      color: '#AB85FF',
      onPress: () => {
        onOpenChat(friend);
        onClose();
      },
    },
    {
      id: 'nav',
      icon: 'navigation-variant',
      label: 'Chỉ đường',
      color: '#45EBC0',
      onPress: () => {
        onNavigate(friend);
        onClose();
      },
    },
    {
      id: 'arrival',
      icon: 'bell-ring-outline',
      label: 'Báo khi đến',
      color: '#FF6BF0',
      onPress: () => {
        onNotifyArrival(friend);
        onClose();
      },
    },
    ...(onEmojiBomb
      ? [
          {
            id: 'emoji_bomb',
            icon: 'fire' as const,
            label: 'Emoji Bomb',
            color: '#FF3366',
            onPress: () => {
              onEmojiBomb(friend);
              onClose();
            },
          },
        ]
      : []),
    ...(onVoicePing
      ? [
          {
            id: 'voice_ping',
            icon: 'microphone' as const,
            label: 'Voice Memo',
            color: '#45EBC0',
            onPress: () => {
              onVoicePing(friend);
              onClose();
            },
          },
        ]
      : []),
    ...(onARFinder
      ? [
          {
            id: 'ar_finder',
            icon: 'compass-outline' as const,
            label: 'AR Radar',
            color: '#48E3FF',
            onPress: () => {
              onARFinder(friend);
              onClose();
            },
          },
        ]
      : []),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.wheelContainer} onPress={e => e.stopPropagation()}>
          {/* Top-right Dismiss Button */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Đóng"
            onPress={onClose}
            style={s.wheelCloseBtn}
            hitSlop={12}
          >
            <MaterialCommunityIcons name="close" size={20} color="#DCEEFF" />
          </Pressable>

          {/* Central Friend Avatar Button */}
          <Pressable onPress={() => { onClose(); onOpenFullDetail(friend); }} style={s.centerAvatarWrap}>
            {friend.avatarUrl ? (
              <Image source={{ uri: friend.avatarUrl }} style={s.avatar} />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitial}>{friend.displayName.charAt(0).toUpperCase()}</Text>
              </View>
            )}
            <View style={s.centerBadge}>
              <MaterialCommunityIcons name="information-variant" size={14} color="#fff" />
            </View>
          </Pressable>

          {/* Friend name & status banner */}
          <GlassSurface style={s.namePill}>
            <Text style={s.friendName} numberOfLines={1}>{friend.displayName}</Text>
            <Text style={s.friendStatus} numberOfLines={1}>{friend.statusText}</Text>
          </GlassSurface>

          {/* Interaction Wheel / Radial Actions Grid */}
          <View style={s.actionsGrid}>
            {actions.map(action => (
              <Pressable
                key={action.id}
                onPress={action.onPress}
                style={({ pressed }) => [s.actionBtn, pressed && s.actionBtnPressed]}
              >
                <GlassSurface style={[s.actionInner, { borderColor: `${action.color}66` }]}>
                  <MaterialCommunityIcons name={action.icon} size={22} color={action.color} />
                  <Text style={s.actionLabel}>{action.label}</Text>
                </GlassSurface>
              </Pressable>
            ))}
          </View>

          {/* Bottom Card for full details */}
          <Pressable
            onPress={() => { onClose(); onOpenFullDetail(friend); }}
            style={s.fullDetailBtn}
          >
            <GlassSurface style={s.fullDetailInner}>
              <MaterialCommunityIcons name="card-account-details-outline" size={16} color="#48E3FF" />
              <Text style={s.fullDetailText}>Xem thẻ thông tin chi tiết</Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#94C8F5" />
            </GlassSurface>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 9, 28, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  wheelContainer: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: 14,
  },
  wheelCloseBtn: {
    position: 'absolute',
    top: -6,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 10,
  },
  centerAvatarWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: '#48E3FF',
    backgroundColor: '#041B44',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 20px rgba(72, 227, 255, 0.65)',
    elevation: 10,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  avatarFallback: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#164375',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
  },
  centerBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#0055FF',
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  namePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: '90%',
  },
  friendName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  friendStatus: {
    color: '#A8D2F8',
    fontSize: 11.5,
    marginTop: 2,
    textAlign: 'center',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  actionBtn: {
    width: '30%',
    minWidth: 92,
  },
  actionBtnPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  actionInner: {
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 18,
    alignItems: 'center',
    gap: 6,
    minHeight: 80,
    borderWidth: 1,
  },
  actionLabel: {
    color: '#fff',
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
  },
  fullDetailBtn: {
    width: '100%',
    marginTop: 4,
  },
  fullDetailInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  fullDetailText: {
    color: '#fff',
    fontSize: 12.5,
    fontWeight: '700',
    flex: 1,
    marginLeft: 8,
  },
});
