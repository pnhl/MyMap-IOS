import {TextInput} from '../ui/TextInput';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, Vibration } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassButton, GlassSurface, glassColors, type IconName } from '../ui/glass';
import { Text } from '../ui/Text';
import type { RealtimeFriend } from '../services/realtimeFriends';

interface HangoutActivity {
  id: string;
  icon: IconName;
  label: string;
  emoji: string;
  color: string;
}

const HANGOUT_ACTIVITIES: HangoutActivity[] = [
  { id: 'coffee', icon: 'coffee', label: 'Cà phê chém gió', emoji: '☕', color: '#E8A87C' },
  { id: 'beer', icon: 'glass-mug-variant', label: 'Đi nhậu / Bia bọt', emoji: '🍻', color: '#FFD700' },
  { id: 'food', icon: 'silverware-fork-knife', label: 'Ăn uống no nê', emoji: '🍕', color: '#FF6B6B' },
  { id: 'movie', icon: 'movie-open', label: 'Xem phim rạp', emoji: '🎬', color: '#AB85FF' },
  { id: 'ride', icon: 'motorbike', label: 'Lượn phố hóng gió', emoji: '🏍️', color: '#45EBC0' },
];

interface HangoutInviteModalProps {
  visible: boolean;
  friend: RealtimeFriend | null;
  onClose: () => void;
  onSendInvite: (friend: RealtimeFriend, activity: HangoutActivity, note?: string) => void;
}

export function HangoutInviteModal({
  visible,
  friend,
  onClose,
  onSendInvite,
}: HangoutInviteModalProps) {
  const [selectedActivity, setSelectedActivity] = useState<HangoutActivity>(HANGOUT_ACTIVITIES[0]!);
  const [note, setNote] = useState('');

  if (!friend) return null;

  const handleSend = () => {
    try {
      Vibration.vibrate([0, 60, 40, 90]);
    } catch {}
    onSendInvite(friend, selectedActivity, note.trim() || undefined);
    setNote('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.cardWrap} onPress={e => e.stopPropagation()}>
          <GlassSurface style={s.dialog}>
            {/* Header */}
            <View style={s.header}>
              <View style={s.iconWrap}>
                <MaterialCommunityIcons name="glass-mug-variant" size={24} color="#FFD700" />
              </View>
              <View style={s.headerText}>
                <Text style={s.title}>Rủ {friend.displayName} đi chơi</Text>
                <Text style={s.subtitle}>Chọn hoạt động hẹn hò tụ tập bạn bè:</Text>
              </View>
              <Pressable hitSlop={10} onPress={onClose} style={s.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#ADCFFF" />
              </Pressable>
            </View>

            {/* Activities list */}
            <View style={s.activitiesContainer}>
              {HANGOUT_ACTIVITIES.map(act => {
                const isSelected = selectedActivity.id === act.id;
                return (
                  <Pressable
                    key={act.id}
                    onPress={() => {
                      try { Vibration.vibrate(30); } catch {}
                      setSelectedActivity(act);
                    }}
                    style={[s.activityBtn, isSelected && s.activityBtnActive]}
                  >
                    <GlassSurface
                      style={[
                        s.activityInner,
                        isSelected && { borderColor: act.color, backgroundColor: 'rgba(255,255,255,0.12)' },
                      ]}
                    >
                      <Text style={s.activityEmoji}>{act.emoji}</Text>
                      <Text style={[s.activityLabel, isSelected && { color: '#FFFFFF', fontWeight: '800' }]}>
                        {act.label}
                      </Text>
                      {isSelected && (
                        <MaterialCommunityIcons name="check-circle" size={18} color={act.color} />
                      )}
                    </GlassSurface>
                  </Pressable>
                );
              })}
            </View>

            {/* Note input */}
            <View style={s.noteSection}>
              <Text style={s.noteLabel}>Lời nhắn kèm theo (tuỳ chọn):</Text>
              <TextInput
                style={s.noteInput}
                placeholder="Ví dụ: Tối nay 7h30 ở Highland gần nhà nhé..."
                placeholderTextColor="rgba(180, 210, 240, 0.45)"
                value={note}
                onChangeText={setNote}
                maxLength={80}
              />
            </View>

            {/* Action Buttons */}
            <View style={s.actionsRow}>
              <Pressable onPress={onClose} style={s.cancelBtn}>
                <Text style={s.cancelText}>Để sau</Text>
              </Pressable>
              <GlassButton
                tone="blue"
                onPress={handleSend}
                style={s.sendBtn}
              ><Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{`Gửi lời rủ ${selectedActivity.emoji}`}</Text></GlassButton>
            </View>
          </GlassSurface>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 9, 28, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  cardWrap: {
    width: '100%',
    maxWidth: 380,
  },
  dialog: {
    padding: 18,
    borderRadius: 24,
    borderColor: 'rgba(100, 200, 255, 0.28)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 215, 0, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 11.5,
    color: '#8DC2E6',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  activitiesContainer: {
    gap: 8,
    marginVertical: 6,
  },
  activityBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  activityBtnActive: {
    transform: [{ scale: 1.01 }],
  },
  activityInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    gap: 10,
  },
  activityEmoji: {
    fontSize: 20,
  },
  activityLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#DCEEFF',
  },
  noteSection: {
    marginTop: 10,
    marginBottom: 14,
  },
  noteLabel: {
    fontSize: 11,
    color: '#8DC2E6',
    marginBottom: 5,
    fontWeight: '600',
  },
  noteInput: {
    backgroundColor: 'rgba(5, 25, 60, 0.65)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(100, 200, 255, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#FFFFFF',
    fontSize: 12.5,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  cancelText: {
    fontSize: 13,
    color: '#8DC2E6',
    fontWeight: '600',
  },
  sendBtn: {
    minWidth: 160,
  },
});
