import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface, IconBadge, glassColors } from '../ui/glass';
import { Text } from '../ui/Text';
import { evaluateAchievements, Achievement } from '../services/achievements';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AchievementsModal({ visible, onClose }: Props) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  async function loadData() {
    setLoading(true);
    try {
      const data = await evaluateAchievements();
      setAchievements(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const totalPoints = achievements
    .filter(a => a.unlocked)
    .reduce((sum, a) => sum + (a.rewardPoints || 0), 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <GlassSurface style={s.card} tone="violet">
          {/* Header */}
          <View style={s.header}>
            <View style={s.titleGroup}>
              <IconBadge name="trophy-award" tone="violet" size={26} />
              <View>
                <Text style={s.title}>Huy Hiệu Nhà Khám Phá</Text>
                <Text style={s.sub}>
                  Đã mở khóa: {unlockedCount}/{achievements.length} · {totalPoints} Điểm
                </Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color="#D4ECFF" />
            </Pressable>
          </View>

          {/* Body */}
          {loading ? (
            <View style={s.centerBox}>
              <ActivityIndicator size="large" color={glassColors.cyan} />
              <Text style={s.loadingText}>Đang đánh giá chiến tích...</Text>
            </View>
          ) : (
            <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
              <View style={s.banner}>
                <MaterialCommunityIcons name="compass-rose" size={20} color={glassColors.cyan} />
                <Text style={s.bannerText}>
                  Di chuyển, chụp ảnh và cụng máy cùng bạn bè để chinh phục toàn bộ danh hiệu độc quyền!
                </Text>
              </View>

              <View style={s.grid}>
                {achievements.map(item => {
                  const isUnlocked = item.unlocked;
                  return (
                    <View
                      key={item.id}
                      style={[
                        s.badgeCard,
                        isUnlocked ? s.badgeCardUnlocked : s.badgeCardLocked,
                      ]}
                    >
                      <View style={s.badgeTop}>
                        <View
                          style={[
                            s.iconContainer,
                            isUnlocked ? s.iconUnlocked : s.iconLocked,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={item.icon as any}
                            size={28}
                            color={isUnlocked ? '#FFD700' : '#789ACA'}
                          />
                        </View>
                        <View style={s.pointsPill}>
                          <MaterialCommunityIcons name="star" size={12} color="#FFD700" />
                          <Text style={s.pointsText}>+{item.rewardPoints}P</Text>
                        </View>
                      </View>

                      <Text style={[s.badgeTitle, !isUnlocked && s.badgeTitleLocked]}>
                        {item.title}
                      </Text>
                      <Text style={s.badgeDesc}>{item.description}</Text>

                      {/* Progress Bar */}
                      <View style={s.progressContainer}>
                        <View style={s.progressBarBg}>
                          <View
                            style={[
                              s.progressBarFill,
                              {
                                width: `${Math.min(100, Math.max(0, item.progress))}%`,
                                backgroundColor: isUnlocked ? '#45EBC0' : glassColors.cyan,
                              },
                            ]}
                          />
                        </View>
                        <Text style={s.progressLabel}>{item.progress}%</Text>
                      </View>
                    </View>
                  );
                })}
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
    paddingBottom: 14,
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
    fontSize: 13,
    color: glassColors.muted,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: glassColors.muted,
  },
  body: {
    flex: 1,
    marginTop: 12,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(72, 227, 255, 0.1)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(72, 227, 255, 0.25)',
  },
  bannerText: {
    flex: 1,
    fontSize: 12.5,
    color: '#D4ECFF',
    lineHeight: 18,
  },
  grid: {
    gap: 12,
  },
  badgeCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
  },
  badgeCardUnlocked: {
    backgroundColor: 'rgba(17, 57, 119, 0.65)',
    borderColor: 'rgba(255, 215, 0, 0.4)',
  },
  badgeCardLocked: {
    backgroundColor: 'rgba(10, 32, 70, 0.35)',
    borderColor: 'rgba(120, 154, 202, 0.2)',
  },
  badgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnlocked: {
    backgroundColor: 'rgba(255, 215, 0, 0.15)',
    borderWidth: 1.5,
    borderColor: '#FFD700',
  },
  iconLocked: {
    backgroundColor: 'rgba(120, 154, 202, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(120, 154, 202, 0.3)',
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  pointsText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFD700',
  },
  badgeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  badgeTitleLocked: {
    color: '#ABC9EF',
  },
  badgeDesc: {
    fontSize: 12.5,
    color: glassColors.muted,
    lineHeight: 18,
    marginBottom: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: glassColors.faint,
    width: 32,
    textAlign: 'right',
  },
});
