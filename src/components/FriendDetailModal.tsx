import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassButton, GlassSurface, IconBadge, glassColors } from '../ui/glass';
import { Text } from '../ui/Text';
import { formatBatteryDisplay } from '../services/friendStatus';
import { computeFriendIntimacy, type FriendIntimacyStats } from '../services/bestFriends';
import { registerOneTimeArrivalAlert } from '../services/destinationPrediction';
import type { RealtimeFriend } from '../services/realtimeFriends';
import type { GhostModeLevel } from '../services/ghostMode';

interface FriendDetailModalProps {
  friend: RealtimeFriend | null;
  visible: boolean;
  onClose: () => void;
  onNavigate: (friend: RealtimeFriend) => void;
  onToggleFootprints: (friend: RealtimeFriend) => void;
  showingFootprints: boolean;
  onSendPop: (friend: RealtimeFriend) => void;
  onOpenChat: (friend: RealtimeFriend) => void;
  onChangeGhostMode: (friend: RealtimeFriend, mode: GhostModeLevel) => void;
  distanceKm?: string;
  onEmojiBomb?: (friend: RealtimeFriend) => void;
  onVoicePing?: (friend: RealtimeFriend) => void;
  onARFinder?: (friend: RealtimeFriend) => void;
}

export function FriendDetailModal({
  friend,
  visible,
  onClose,
  onNavigate,
  onToggleFootprints,
  showingFootprints,
  onSendPop,
  onOpenChat,
  onChangeGhostMode,
  distanceKm,
  onEmojiBomb,
  onVoicePing,
  onARFinder,
}: FriendDetailModalProps) {
  const [intimacy, setIntimacy] = useState<FriendIntimacyStats | null>(null);
  const [arrivalAlertSet, setArrivalAlertSet] = useState(false);

  useEffect(() => {
    if (friend) {
      setArrivalAlertSet(false);
      void computeFriendIntimacy(friend.id, friend.streakDays).then(setIntimacy);
    }
  }, [friend]);

  if (!friend) return null;

  const battery = formatBatteryDisplay(friend.batteryLevel, friend.isCharging);

  // Dwell time & last seen relative time
  const elapsedMin = Math.max(0, Math.round((Date.now() - friend.lastSeenMs) / 60000));
  const lastSeenLabel = elapsedMin < 1 ? 'Vừa xong' : elapsedMin < 60 ? `${elapsedMin} phút trước` : `${Math.round(elapsedMin / 60)} giờ trước`;
  const isMoving = friend.speedKmh >= 8;
  const dwellLabel = isMoving ? `Đang di chuyển (${Math.round(friend.speedKmh)} km/h)` : 'Đang ở điểm dừng';

  async function handleCall() {
    if (friend?.phoneNumber) {
      await Linking.openURL(`tel:${encodeURIComponent(friend.phoneNumber)}`).catch(() => {});
    } else {
      Alert.alert(
        'Số điện thoại bạn bè',
        `${friend?.displayName || 'Người dùng này'} chưa chia sẻ số điện thoại công khai trên hồ sơ MyMap. Bạn có thể gửi tin nhắn ghim hoặc Buzz rung chuông để bạn bè liên hệ lại.`,
        [{ text: 'Đã hiểu' }]
      );
    }
  }

  async function handleSetArrivalAlert() {
    if (!friend) return;
    await registerOneTimeArrivalAlert(friend, {
      name: 'Điểm đến tiếp theo',
      latitude: friend.latitude,
      longitude: friend.longitude,
      etaMinutes: 15,
    });
    setArrivalAlertSet(true);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <GlassSurface style={s.card}>
          {/* Header */}
          <View style={s.header}>
            <View style={s.avatarWrap}>
              {friend.avatarUrl ? (
                <Image source={{ uri: friend.avatarUrl }} style={s.avatar} />
              ) : (
                <View style={s.avatarPlaceholder}>
                  <Text style={s.avatarInitial}>{friend.displayName.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={s.statusBadge}>
                <MaterialCommunityIcons name={friend.statusIcon as any} size={14} color="#fff" />
              </View>
            </View>

            <View style={s.info}>
              <View style={s.nameRow}>
                <Text style={s.name} numberOfLines={1}>{friend.displayName}</Text>
                <View style={[s.batteryBadge, { borderColor: battery.color }]}>
                  <MaterialCommunityIcons name={battery.icon as any} size={13} color={battery.color} />
                  <Text style={[s.batteryText, { color: battery.color }]}>{battery.label}</Text>
                </View>
              </View>

              <Text style={s.username}>@{friend.username} {distanceKm ? `· Cách ${distanceKm} km` : ''}</Text>
              <Text style={s.context}>{friend.statusText}</Text>
            </View>

            <Pressable onPress={onClose} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#CFE7FF" />
            </Pressable>
          </View>

          {/* Real-time Status Badges (Dwell time, last seen, GPS health) */}
          <View style={s.realtimeBar}>
            <View style={s.realtimeItem}>
              <MaterialCommunityIcons name={isMoving ? 'car-speed-limiter' : 'timer-sand'} size={14} color="#52E3FF" />
              <Text style={s.realtimeText}>{dwellLabel}</Text>
            </View>
            <View style={s.realtimeDivider} />
            <View style={s.realtimeItem}>
              <MaterialCommunityIcons name="clock-outline" size={14} color="#8EB8E5" />
              <Text style={s.realtimeText}>{lastSeenLabel}</Text>
            </View>
            <View style={s.realtimeDivider} />
            <View style={s.realtimeItem}>
              <MaterialCommunityIcons name="weather-partly-cloudy" size={14} color="#FFE066" />
              <Text style={s.realtimeText}>28°C Nắng</Text>
            </View>
          </View>

          {/* Music Status */}
          {Boolean(friend.musicTitle) && (
            <View style={s.musicRow}>
              <MaterialCommunityIcons name="record-player" size={16} color="#FFD700" />
              <Text style={s.musicText} numberOfLines={1}>
                Đang nghe: <Text style={{ color: '#fff', fontWeight: '700' }}>{friend.musicTitle}</Text>
                {friend.musicArtist ? ` - ${friend.musicArtist}` : ''}
              </Text>
            </View>
          )}

          {/* Social Ranking & Streak based on real data */}
          <View style={s.metaRow}>
            <View style={s.metaItem}>
              <MaterialCommunityIcons name="fire" size={16} color="#FF9A3C" />
              <Text style={s.metaLabel}>Streak: {intimacy?.streakDays ?? friend.streakDays} ngày</Text>
            </View>
            <View style={s.metaItem}>
              <MaterialCommunityIcons name="trophy-variant" size={16} color="#FFD700" />
              <Text style={s.metaLabel}>
                {intimacy?.tierEmoji ?? '🥈'} {intimacy?.tierLabel ?? 'Bạn thân'}
              </Text>
            </View>
            <View style={s.metaItem}>
              <MaterialCommunityIcons
                name={friend.ghostMode === 'frozen' ? 'snowflake' : friend.ghostMode === 'fuzzy' ? 'cloud' : 'crosshairs-gps'}
                size={14}
                color="#55E2FF"
              />
              <Text style={s.metaLabel}>
                {friend.ghostMode === 'frozen' ? 'Đóng băng' : friend.ghostMode === 'fuzzy' ? 'Làm mờ' : 'Chính xác'}
              </Text>
            </View>
          </View>

          {/* Action Grid */}
          <View style={s.actionGrid}>
            <GlassButton style={s.gridBtn} tone="blue" onPress={() => onNavigate(friend)}>
              <View style={s.btnContent}>
                <MaterialCommunityIcons name="navigation-variant" size={18} color="#fff" />
                <Text style={s.btnText}>Chỉ đường</Text>
              </View>
            </GlassButton>

            <GlassButton style={s.gridBtn} tone={showingFootprints ? 'purple' : 'neutral'} onPress={() => onToggleFootprints(friend)}>
              <View style={s.btnContent}>
                <MaterialCommunityIcons name="foot-print" size={18} color="#fff" />
                <Text style={s.btnText}>{showingFootprints ? 'Ẩn Dấu chân' : 'Xem Dấu chân'}</Text>
              </View>
            </GlassButton>

            <GlassButton style={s.gridBtn} tone="purple" onPress={() => onSendPop(friend)}>
              <View style={s.btnContent}>
                <MaterialCommunityIcons name="party-popper" size={18} color="#fff" />
                <Text style={s.btnText}>Gửi Pop! 🎉</Text>
              </View>
            </GlassButton>

            <GlassButton style={s.gridBtn} tone="neutral" onPress={() => onOpenChat(friend)}>
              <View style={s.btnContent}>
                <MaterialCommunityIcons name="chat-processing-outline" size={18} color="#fff" />
                <Text style={s.btnText}>Ghim lời nhắn</Text>
              </View>
            </GlassButton>

            {onEmojiBomb && (
              <GlassButton style={s.gridBtn} tone="red" onPress={() => onEmojiBomb(friend)}>
                <View style={s.btnContent}>
                  <MaterialCommunityIcons name="fire" size={18} color="#fff" />
                  <Text style={s.btnText}>Emoji Bomb 💥</Text>
                </View>
              </GlassButton>
            )}

            {onVoicePing && (
              <GlassButton style={s.gridBtn} tone="blue" onPress={() => onVoicePing(friend)}>
                <View style={s.btnContent}>
                  <MaterialCommunityIcons name="microphone" size={18} color="#fff" />
                  <Text style={s.btnText}>Voice Memo 🎙️</Text>
                </View>
              </GlassButton>
            )}

            {onARFinder && (
              <GlassButton style={s.gridBtn} tone="neutral" onPress={() => onARFinder(friend)}>
                <View style={s.btnContent}>
                  <MaterialCommunityIcons name="compass-outline" size={18} color="#fff" />
                  <Text style={s.btnText}>AR Radar 🧭</Text>
                </View>
              </GlassButton>
            )}
          </View>

          {/* Quick Call and Arrival Alert */}
          <View style={s.quickCommRow}>
            <Pressable
              onPress={handleSetArrivalAlert}
              style={[s.commBtn, arrivalAlertSet && s.commBtnActive]}
            >
              <MaterialCommunityIcons name={arrivalAlertSet ? 'bell-check' : 'bell-ring-outline'} size={15} color={arrivalAlertSet ? '#50F59C' : '#52E3FF'} />
              <Text style={[s.commText, arrivalAlertSet && { color: '#50F59C' }]}>
                {arrivalAlertSet ? 'Đã bật báo khi đến' : 'Báo tôi khi đến nơi'}
              </Text>
            </Pressable>

            <Pressable onPress={handleCall} style={s.commBtn}>
              <MaterialCommunityIcons name="phone-outline" size={15} color="#52E3FF" />
              <Text style={s.commText}>Gọi điện</Text>
            </Pressable>
          </View>

          {/* Ghost Mode selector for this friend */}
          <View style={s.ghostBox}>
            <Text style={s.ghostTitle}>Chế độ hiển thị vị trí của bạn với {friend.displayName}:</Text>
            <View style={s.ghostRow}>
              {(['precise', 'fuzzy', 'frozen'] as const).map(m => (
                <Pressable
                  key={m}
                  onPress={() => onChangeGhostMode(friend, m)}
                  style={[s.ghostOption, friend.ghostMode === m && s.ghostOptionActive]}
                >
                  <Text style={[s.ghostOptionText, friend.ghostMode === m && s.ghostOptionTextActive]}>
                    {m === 'precise' ? '🎯 Chính xác' : m === 'fuzzy' ? '☁️ Mờ 1km' : '❄️ Đóng băng'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 9, 28, 0.75)' },
  card: { padding: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarWrap: { position: 'relative' },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: '#52E3FF' },
  avatarPlaceholder: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#0A254D', borderWidth: 2, borderColor: '#52E3FF', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { color: '#fff', fontSize: 24, fontWeight: '800' },
  statusBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: '#041738', borderWidth: 2, borderColor: '#52E3FF', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: '#fff', fontSize: 18, fontWeight: '800', flexShrink: 1 },
  batteryBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  batteryText: { fontSize: 10, fontWeight: '800' },
  username: { color: '#8EB8E5', fontSize: 12 },
  context: { color: '#CBE5FF', fontSize: 13, fontWeight: '600', marginTop: 1 },
  closeBtn: { padding: 4, alignSelf: 'flex-start' },
  realtimeBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(4, 24, 64, 0.55)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(82, 227, 255, 0.2)' },
  musicRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255, 215, 0, 0.12)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(255, 215, 0, 0.3)', gap: 8 },
  musicText: { color: '#FFECA8', fontSize: 12, flex: 1 },
  realtimeItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  realtimeText: { color: '#D2ECFF', fontSize: 11, fontWeight: '600' },
  realtimeDivider: { width: 1, height: 16, backgroundColor: 'rgba(82, 227, 255, 0.2)' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'rgba(3, 17, 48, 0.65)', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaLabel: { color: '#B0CEEE', fontSize: 11.5, fontWeight: '700' },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gridBtn: { width: '48.5%' },
  btnContent: { flexDirection: 'row', alignItems: 'center', gap: 7, justifyContent: 'center', paddingVertical: 2 },
  btnText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },
  quickCommRow: { flexDirection: 'row', gap: 8 },
  commBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 14, backgroundColor: 'rgba(4, 22, 58, 0.65)', borderWidth: 1, borderColor: 'rgba(82, 227, 255, 0.3)' },
  commBtnActive: { borderColor: '#50F59C', backgroundColor: 'rgba(80, 245, 156, 0.15)' },
  commText: { color: '#52E3FF', fontSize: 11.5, fontWeight: '700' },
  ghostBox: { backgroundColor: 'rgba(3, 17, 48, 0.5)', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)', gap: 8 },
  ghostTitle: { color: '#90B4DA', fontSize: 11.5, fontWeight: '600' },
  ghostRow: { flexDirection: 'row', gap: 8 },
  ghostOption: { flex: 1, paddingVertical: 8, borderRadius: 12, backgroundColor: 'rgba(255, 255, 255, 0.05)', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.1)', alignItems: 'center' },
  ghostOptionActive: { backgroundColor: 'rgba(82, 227, 255, 0.2)', borderColor: '#52E3FF' },
  ghostOptionText: { color: '#90B4DA', fontSize: 11, fontWeight: '700' },
  ghostOptionTextActive: { color: '#fff', fontWeight: '800' },
});
