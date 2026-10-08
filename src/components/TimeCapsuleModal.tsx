import {TextInput} from '../ui/TextInput';
import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  Alert,
  Vibration,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface, GlassButton, IconBadge, glassColors } from '../ui/glass';
import { Text } from '../ui/Text';
import * as Location from 'expo-location';
import {getDeviceCurrentPosition} from '../services/platformLocation';
import {
  checkNearbyCapsules,
  saveTimeCapsule,
  openCapsule,
  CapsuleCheckResult,
} from '../services/timeCapsule';

type Props = {
  visible: boolean;
  onClose: () => void;
  userLat: number;
  userLon: number;
};

export function TimeCapsuleModal({ visible, onClose, userLat, userLon }: Props) {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [capsules, setCapsules] = useState<CapsuleCheckResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [lockDurationDays, setLockDurationDays] = useState(7); // default 7 days

  useEffect(() => {
    if (visible) {
      loadCapsules();
    }
  }, [visible, userLat, userLon]);

  async function loadCapsules() {
    setLoading(true);
    try {
      const results = await checkNearbyCapsules(userLat, userLon, 50);
      setCapsules(results);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!title.trim() || !message.trim()) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập tiêu đề và lời nhắn cho viên nang.');
      return;
    }

    const unlockAt = Date.now() + lockDurationDays * 24 * 60 * 60 * 1000;
    try {
      await saveTimeCapsule({
        title: title.trim(),
        message: message.trim(),
        latitude: userLat,
        longitude: userLon,
        unlockAt,
        creatorName: 'Bạn',
      });
      Vibration.vibrate([0, 50, 40, 60]);
      Alert.alert(
        'Thành công! ⏳',
        `Viên nang thời gian đã được chôn tại tọa độ này. Nó sẽ được mở khóa sau ${lockDurationDays} ngày!`
      );
      setTitle('');
      setMessage('');
      setActiveTab('list');
      loadCapsules();
    } catch {
      Alert.alert('Lỗi', 'Không thể lưu viên nang.');
    }
  }

  async function handleOpen(capsuleId: string, itemTitle: string, itemMessage: string) {
    try{
      const permission=await Location.requestForegroundPermissionsAsync();if(!permission.granted)throw new Error('Cần quyền vị trí để kiểm tra khoảng cách.');
      const fix=await getDeviceCurrentPosition({accuracy:Location.Accuracy.High});
      const opened=await openCapsule(capsuleId,{...fix.coords,timestamp:fix.timestamp});
      if(!opened)throw new Error('Chưa đến ngày mở hoặc chưa có định vị chính xác trong bán kính 50 m.');
      Vibration.vibrate([0,60,50,100]);Alert.alert(`✨ Mở Viên Nang: ${itemTitle}`, itemMessage);void loadCapsules();
    }catch(e){Alert.alert('Chưa mở được viên nang',e instanceof Error?e.message:String(e));}
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <GlassSurface style={s.card} tone="cyan">
          {/* Header */}
          <View style={s.header}>
            <View style={s.titleGroup}>
              <IconBadge name="timer-sand" tone="cyan" size={26} />
              <View>
                <Text style={s.title}>Viên Nang Thời Gian</Text>
                <Text style={s.sub}>Bảo mật ký ức theo tọa độ & thời gian</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color="#D4ECFF" />
            </Pressable>
          </View>

          {/* Segmented Control */}
          <View style={s.tabBar}>
            <Pressable
              style={[s.tabItem, activeTab === 'list' && s.tabItemActive]}
              onPress={() => setActiveTab('list')}
            >
              <MaterialCommunityIcons
                name="treasure-chest"
                size={18}
                color={activeTab === 'list' ? '#FFF' : glassColors.muted}
              />
              <Text style={[s.tabText, activeTab === 'list' && s.tabTextActive]}>
                Quanh đây ({capsules.length})
              </Text>
            </Pressable>
            <Pressable
              style={[s.tabItem, activeTab === 'create' && s.tabItemActive]}
              onPress={() => setActiveTab('create')}
            >
              <MaterialCommunityIcons
                name="plus-circle-outline"
                size={18}
                color={activeTab === 'create' ? '#FFF' : glassColors.muted}
              />
              <Text style={[s.tabText, activeTab === 'create' && s.tabTextActive]}>
                Chôn viên nang
              </Text>
            </Pressable>
          </View>

          {/* Tab 1: Nearby Capsules */}
          {activeTab === 'list' ? (
            <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
              {capsules.length === 0 ? (
                <View style={s.emptyBox}>
                  <MaterialCommunityIcons name="map-marker-question" size={48} color={glassColors.muted} />
                  <Text style={s.emptyTitle}>Chưa có viên nang nào quanh đây</Text>
                  <Text style={s.emptyDesc}>
                    Hãy chôn một bức thư hoặc lời nhắn tại tọa độ hiện tại để khám phá lại sau này!
                  </Text>
                </View>
              ) : (
                <View style={s.capsuleList}>
                  {capsules.map(({ capsule, distanceMeters, isWithinReach, isTimeUnlocked, canOpen }) => {
                    const unlockDateStr = new Date(capsule.unlockAt).toLocaleDateString('vi-VN');
                    return (
                      <View
                        key={capsule.id}
                        style={[
                          s.capsuleCard,
                          canOpen ? s.capsuleCardOpenable : s.capsuleCardLocked,
                        ]}
                      >
                        <View style={s.cardTopRow}>
                          <View style={s.capsuleTitleRow}>
                            <MaterialCommunityIcons
                              name={canOpen ? 'lock-open-variant' : 'lock'}
                              size={20}
                              color={canOpen ? '#45EBC0' : '#FF93AD'}
                            />
                            <Text style={s.capsuleTitle}>{capsule.title}</Text>
                          </View>
                          <View style={s.distBadge}>
                            <Text style={s.distText}>{distanceMeters}m</Text>
                          </View>
                        </View>

                        <Text style={s.lockInfo}>
                          {isTimeUnlocked
                            ? '✅ Đã đến ngày mở khóa'
                            : `⏳ Khóa đến ngày: ${unlockDateStr}`}
                        </Text>
                        <Text style={s.distInfo}>
                          {isWithinReach
                            ? '📍 Bạn đang ở trong phạm vi 50m'
                            : `🚶 Hãy tiến lại gần hơn (${distanceMeters}m > 50m)`}
                        </Text>

                        {capsule.isOpened ? (
                          <View style={s.openedContentBox}>
                            <Text style={s.openedLabel}>Nội dung viên nang:</Text>
                            <Text style={s.openedMessage}>{capsule.message}</Text>
                          </View>
                        ) : canOpen ? (
                          <GlassButton
                            tone="blue"
                            onPress={() => handleOpen(capsule.id, capsule.title, capsule.message)}
                            style={s.openBtn}
                          >
                            <MaterialCommunityIcons name="key-variant" size={18} color="#FFF" />
                            <Text style={s.openBtnText}>Khai Quật & Đọc Lời Nhắn</Text>
                          </GlassButton>
                        ) : (
                          <View style={s.lockedPill}>
                            <MaterialCommunityIcons name="shield-lock" size={16} color="#ABC9EF" />
                            <Text style={s.lockedPillText}>Đang niêm phong bảo mật</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          ) : (
            /* Tab 2: Create Capsule */
            <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
              <View style={s.formWrap}>
                <Text style={s.inputLabel}>Tiêu đề viên nang</Text>
                <TextInput
                  style={s.input}
                  placeholder="Ví dụ: Lời nhắn gửi tuổi 25, Hẹn gặp lại..."
                  placeholderTextColor={glassColors.faint}
                  value={title}
                  onChangeText={setTitle}
                />

                <Text style={s.inputLabel}>Lời nhắn / Ký ức</Text>
                <TextInput
                  style={[s.input, s.textArea]}
                  placeholder="Viết những suy nghĩ, bí mật hoặc lời nhắn gửi tương lai..."
                  placeholderTextColor={glassColors.faint}
                  multiline
                  numberOfLines={4}
                  value={message}
                  onChangeText={setMessage}
                />

                <Text style={s.inputLabel}>Thời gian niêm phong</Text>
                <View style={s.durationRow}>
                  {[
                    { label: '1 Ngày', days: 1 },
                    { label: '7 Ngày', days: 7 },
                    { label: '1 Tháng', days: 30 },
                    { label: '1 Năm', days: 365 },
                  ].map(opt => (
                    <Pressable
                      key={opt.days}
                      style={[
                        s.durationChip,
                        lockDurationDays === opt.days && s.durationChipActive,
                      ]}
                      onPress={() => setLockDurationDays(opt.days)}
                    >
                      <Text
                        style={[
                          s.durationChipText,
                          lockDurationDays === opt.days && s.durationChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <View style={s.coordBanner}>
                  <MaterialCommunityIcons name="crosshairs-gps" size={18} color={glassColors.cyan} />
                  <Text style={s.coordText}>
                    Niêm phong tại: {userLat.toFixed(5)}, {userLon.toFixed(5)}
                  </Text>
                </View>

                <GlassButton tone="purple" onPress={handleCreate} style={s.submitBtn}>
                  <MaterialCommunityIcons name="lock-check" size={20} color="#FFF" />
                  <Text style={s.submitBtnText}>Chôn Viên Nang Tại Đây</Text>
                </GlassButton>
              </View>
              <View style={{ height: 24 }} />
            </ScrollView>
          )}
        </GlassSurface>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 9, 28, 0.82)',
    justifyContent: 'flex-end',
  },
  card: {
    height: '84%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(152, 211, 255, 0.15)',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFF',
  },
  sub: {
    fontSize: 12.5,
    color: glassColors.muted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 14,
    padding: 4,
    marginTop: 12,
    marginBottom: 8,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabItemActive: {
    backgroundColor: 'rgba(72, 227, 255, 0.25)',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: glassColors.muted,
  },
  tabTextActive: {
    color: '#FFF',
  },
  body: {
    flex: 1,
    marginTop: 8,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFF',
  },
  emptyDesc: {
    fontSize: 13,
    color: glassColors.muted,
    textAlign: 'center',
    lineHeight: 18,
  },
  capsuleList: {
    gap: 12,
  },
  capsuleCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
  },
  capsuleCardOpenable: {
    backgroundColor: 'rgba(17, 57, 119, 0.7)',
    borderColor: 'rgba(69, 235, 192, 0.5)',
  },
  capsuleCardLocked: {
    backgroundColor: 'rgba(10, 32, 70, 0.4)',
    borderColor: 'rgba(120, 154, 202, 0.25)',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  capsuleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  capsuleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
    flex: 1,
  },
  distBadge: {
    backgroundColor: 'rgba(72, 227, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  distText: {
    fontSize: 12,
    fontWeight: '700',
    color: glassColors.cyan,
  },
  lockInfo: {
    fontSize: 12.5,
    color: '#D4ECFF',
    marginBottom: 4,
  },
  distInfo: {
    fontSize: 12,
    color: glassColors.muted,
    marginBottom: 10,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  openBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFF',
  },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingVertical: 8,
    borderRadius: 10,
  },
  lockedPillText: {
    fontSize: 12,
    color: glassColors.muted,
  },
  openedContentBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  openedLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#45EBC0',
    marginBottom: 4,
  },
  openedMessage: {
    fontSize: 13,
    color: '#FFF',
    lineHeight: 18,
  },
  formWrap: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#D4ECFF',
    marginTop: 4,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(152, 211, 255, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#FFF',
    fontSize: 14,
  },
  textArea: {
    height: 90,
    textAlignVertical: 'top',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
  },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  durationChipActive: {
    backgroundColor: 'rgba(171, 133, 255, 0.35)',
    borderColor: '#AB85FF',
  },
  durationChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: glassColors.muted,
  },
  durationChipTextActive: {
    color: '#FFF',
  },
  coordBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(72, 227, 255, 0.1)',
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
  },
  coordText: {
    fontSize: 12,
    color: glassColors.cyan,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 8,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
});
