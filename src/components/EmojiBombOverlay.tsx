import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Vibration,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface } from '../ui/glass';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export type EmojiType = '❤️' | '🔥' | '💥' | '🚀' | '💩' | '🎉' | '⚡' | '⭐' | '👻';

export const AVAILABLE_BOMB_EMOJIS: EmojiType[] = ['❤️', '🔥', '💥', '🚀', '💩', '🎉', '⚡', '⭐'];

interface Particle {
  id: string;
  emoji: EmojiType;
  x: number;
  startY: number;
  animY: Animated.Value;
  animOpacity: Animated.Value;
  animScale: Animated.Value;
  animRotate: Animated.Value;
}

interface EmojiBombOverlayProps {
  visible: boolean;
  emoji?: EmojiType;
  count?: number;
  onComplete?: () => void;
  onClose?: () => void;
  targetName?: string;
  onSendBomb?: (emoji: string, count: number) => void;
}

export function EmojiBombOverlay({
  visible,
  emoji: initialEmoji = '🔥',
  onClose,
  targetName,
  onSendBomb,
}: EmojiBombOverlayProps) {
  const [selectedEmoji, setSelectedEmoji] = useState<EmojiType>(initialEmoji);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [comboCount, setComboCount] = useState(0);
  const comboAnim = useRef(new Animated.Value(1)).current;
  const comboResetTimer = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setComboCount(0);
    } else {
      setParticles([]);
    }
  }, [visible]);

  const spawnParticles = (emoji: EmojiType, amount: number) => {
    try {
      Vibration.vibrate(amount > 5 ? [0, 40, 30, 60] : 35);
    } catch {}

    const newParticles: Particle[] = [];
    for (let i = 0; i < amount; i++) {
      const x = Math.random() * (SCREEN_WIDTH - 80) + 40;
      const startY = SCREEN_HEIGHT * 0.76 + (Math.random() * 60 - 30);
      newParticles.push({
        id: `p_${Date.now()}_${Math.random()}_${i}`,
        emoji,
        x,
        startY,
        animY: new Animated.Value(startY),
        animOpacity: new Animated.Value(1),
        animScale: new Animated.Value(0.4 + Math.random() * 0.6),
        animRotate: new Animated.Value(Math.random() * 40 - 20),
      });
    }

    setParticles(prev => [...prev.slice(-30), ...newParticles]);

    newParticles.forEach(p => {
      const targetY = p.startY - (SCREEN_HEIGHT * 0.5 + Math.random() * SCREEN_HEIGHT * 0.35);
      const duration = 1100 + Math.random() * 700;

      Animated.parallel([
        Animated.timing(p.animY, {
          toValue: targetY,
          duration,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(p.animScale, {
            toValue: 1.3 + Math.random() * 0.5,
            duration: duration * 0.3,
            useNativeDriver: true,
          }),
          Animated.timing(p.animScale, {
            toValue: 0.85,
            duration: duration * 0.7,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(duration * 0.55),
          Animated.timing(p.animOpacity, {
            toValue: 0,
            duration: duration * 0.45,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setParticles(prev => prev.filter(item => item.id !== p.id));
      });
    });
  };

  const handleLaunchBomb = (amount = 4) => {
    const nextCount = comboCount + amount;
    setComboCount(nextCount);

    // Pulse combo badge
    comboAnim.setValue(1.4);
    Animated.spring(comboAnim, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }).start();

    spawnParticles(selectedEmoji, amount);
    onSendBomb?.(selectedEmoji, amount);

    if (comboResetTimer.current) clearTimeout(comboResetTimer.current);
    comboResetTimer.current = setTimeout(() => {
      setComboCount(0);
    }, 4500);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        {/* Floating Particles Area */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {particles.map(p => (
            <Animated.View
              key={p.id}
              style={[
                s.particle,
                {
                  left: p.x,
                  transform: [
                    { translateY: p.animY },
                    { scale: p.animScale },
                    {
                      rotate: p.animRotate.interpolate({
                        inputRange: [-20, 20],
                        outputRange: ['-20deg', '20deg'],
                      }),
                    },
                  ],
                  opacity: p.animOpacity,
                },
              ]}
            >
              <Text style={s.particleEmoji}>{p.emoji}</Text>
            </Animated.View>
          ))}
        </View>

        {/* Interactive Bottom Control Sheet */}
        <Pressable style={s.sheetContainer} onPress={e => e.stopPropagation()}>
          <GlassSurface style={s.controlCard}>
            {/* Header */}
            <View style={s.cardHeader}>
              <View style={s.headerTextWrap}>
                <Text style={s.title}>💥 Bão Emoji tới {targetName || 'bạn bè'}</Text>
                <Text style={s.subTitle}>Nhấn liên tục để thả bão emoji ngập màn hình!</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng"
                onPress={onClose}
                style={s.closeBtn}
                hitSlop={12}
              >
                <MaterialCommunityIcons name="close" size={20} color="#CFE7FF" />
              </Pressable>
            </View>

            {/* Emoji Selection Bar */}
            <View style={s.selectorSection}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.emojiScroll}
              >
                {AVAILABLE_BOMB_EMOJIS.map(item => (
                  <Pressable
                    key={item}
                    onPress={() => {
                      setSelectedEmoji(item);
                      Vibration.vibrate(20);
                    }}
                    style={[s.emojiChip, selectedEmoji === item && s.emojiChipActive]}
                  >
                    <Text style={s.emojiChipText}>{item}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Combo Badge */}
            {comboCount > 0 && (
              <Animated.View style={[s.comboBadge, { transform: [{ scale: comboAnim }] }]}>
                <MaterialCommunityIcons name="fire" size={16} color="#FF9A3C" />
                <Text style={s.comboText}>COMBO x{comboCount} BÃO LỬA!</Text>
              </Animated.View>
            )}

            {/* Action Buttons */}
            <View style={s.actionRow}>
              <Pressable
                onPress={() => handleLaunchBomb(4)}
                style={({ pressed }) => [s.primaryBombBtn, pressed && s.primaryBombBtnPressed]}
              >
                <Text style={s.primaryBombIcon}>{selectedEmoji}</Text>
                <Text style={s.primaryBombText}>BẮN EMOJI (Nhấn nhanh!)</Text>
              </Pressable>

              <Pressable
                onPress={() => handleLaunchBomb(20)}
                style={({ pressed }) => [s.superBombBtn, pressed && s.superBombBtnPressed]}
              >
                <Text style={s.superBombText}>💥 Bão x20</Text>
              </Pressable>
            </View>
          </GlassSurface>
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 9, 28, 0.72)',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 28,
  },
  sheetContainer: {
    width: '92%',
    maxWidth: 420,
  },
  controlCard: {
    padding: 18,
    borderRadius: 26,
    backgroundColor: 'rgba(6, 26, 68, 0.94)',
    borderWidth: 1.5,
    borderColor: 'rgba(72, 227, 255, 0.45)',
    shadowColor: '#48E3FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 12,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  title: {
    color: '#F4FAFF',
    fontSize: 17,
    fontWeight: '800',
  },
  subTitle: {
    color: '#94C8F5',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectorSection: {
    marginTop: 2,
  },
  emojiScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  emojiChipActive: {
    backgroundColor: 'rgba(72, 227, 255, 0.25)',
    borderColor: '#48E3FF',
    transform: [{ scale: 1.1 }],
  },
  emojiChipText: {
    fontSize: 22,
  },
  comboBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 154, 60, 0.25)',
    borderColor: '#FF9A3C',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  comboText: {
    color: '#FFB870',
    fontSize: 13,
    fontWeight: '900',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  primaryBombBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF3366',
    borderRadius: 20,
    paddingVertical: 14,
    shadowColor: '#FF3366',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6,
  },
  primaryBombBtnPressed: {
    transform: [{ scale: 0.96 }],
    backgroundColor: '#E61E52',
  },
  primaryBombIcon: {
    fontSize: 20,
  },
  primaryBombText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
  },
  superBombBtn: {
    backgroundColor: 'rgba(255, 215, 0, 0.22)',
    borderColor: '#FFD700',
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  superBombBtnPressed: {
    backgroundColor: 'rgba(255, 215, 0, 0.4)',
    transform: [{ scale: 0.96 }],
  },
  superBombText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '800',
  },
  particle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  particleEmoji: {
    fontSize: 38,
  },
});
