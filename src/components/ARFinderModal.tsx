import React, { useEffect, useState, useRef } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Image,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Magnetometer } from 'expo-sensors';
import { GlassSurface, glassColors } from '../ui/glass';
import { Text } from '../ui/Text';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  visible: boolean;
  onClose: () => void;
  friendName: string;
  friendAvatar?: string;
  friendLat: number;
  friendLon: number;
  userLat: number;
  userLon: number;
};

function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
}

function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function ARFinderModal({
  visible,
  onClose,
  friendName,
  friendAvatar,
  friendLat,
  friendLon,
  userLat,
  userLon,
}: Props) {
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [hasSensor, setHasSensor] = useState<boolean>(true);
  const radarSweepAnim = useRef(new Animated.Value(0)).current;

  // Radar sweep continuous loop
  useEffect(() => {
    if (!visible) return;
    const loop = Animated.loop(
      Animated.timing(radarSweepAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [visible]);

  // Magnetometer compass heading listener
  useEffect(() => {
    if (!visible) return;

    let sub: any = null;
    async function startCompass() {
      try {
        const isAvailable = await Magnetometer.isAvailableAsync();
        if (!isAvailable) {
          setHasSensor(false);
          return;
        }
        Magnetometer.setUpdateInterval(100);
        sub = Magnetometer.addListener(data => {
          let angle = Math.atan2(-data.y, data.x);
          let deg = (angle * 180) / Math.PI;
          if (deg < 0) deg += 360;
          setDeviceHeading(deg);
        });
      } catch {
        setHasSensor(false);
      }
    }

    startCompass();
    return () => {
      if (sub && typeof sub.remove === 'function') {
        sub.remove();
      }
    };
  }, [visible]);

  const targetBearing = calculateBearing(userLat, userLon, friendLat, friendLon);
  const distanceMeters = Math.round(
    haversineDistanceMeters(userLat, userLon, friendLat, friendLon)
  );

  // Relative angle to rotate the AR arrow pointer
  const relativeAngle = (targetBearing - deviceHeading + 360) % 360;

  const isVeryClose = distanceMeters <= 20;

  const sweepInterpolate = radarSweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <LinearGradient
          colors={['rgba(2, 9, 28, 0.95)', 'rgba(6, 26, 68, 0.96)', '#02091C']}
          style={StyleSheet.absoluteFill}
        />

        {/* Top Header */}
        <View style={s.header}>
          <View style={s.targetCard}>
            {friendAvatar ? (
              <Image source={{ uri: friendAvatar }} style={s.avatar} />
            ) : (
              <View style={s.avatarFallback}>
                <Text style={s.avatarInitial}>
                  {(friendName || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View>
              <Text style={s.friendTitle}>Đang tìm kiếm: {friendName}</Text>
              <Text style={s.friendSub}>
                {isVeryClose ? '🎉 Đã ở ngay sát bên bạn!' : 'Theo hướng mũi tên radar'}
              </Text>
            </View>
          </View>
          <Pressable onPress={onClose} style={s.closeBtn}>
            <MaterialCommunityIcons name="close" size={24} color="#FFF" />
          </Pressable>
        </View>

        {/* Radar Center HUD */}
        <View style={s.centerHud}>
          {/* Radar Circles */}
          <View style={s.radarRingOuter}>
            <View style={s.radarRingMiddle}>
              <View style={s.radarRingInner}>
                {/* Center crosshair */}
                <View style={s.crosshairV} />
                <View style={s.crosshairH} />
              </View>
            </View>
          </View>

          {/* Radar Rotating Sweep Line */}
          <Animated.View
            style={[
              s.radarSweepWrap,
              { transform: [{ rotate: sweepInterpolate }] },
            ]}
          >
            <LinearGradient
              colors={['rgba(72, 227, 255, 0.45)', 'transparent']}
              style={s.radarSweepGradient}
            />
          </Animated.View>

          {/* Directed AR Pointer Arrow */}
          <View
            style={[
              s.arrowContainer,
              { transform: [{ rotate: `${relativeAngle}deg` }] },
            ]}
          >
            <View style={s.arrowGlow}>
              <MaterialCommunityIcons
                name="navigation"
                size={72}
                color={isVeryClose ? '#45EBC0' : glassColors.cyan}
              />
            </View>
          </View>
        </View>

        {/* Bottom Distance & Compass Readout */}
        <View style={s.bottomPanel}>
          <GlassSurface style={s.glassInfo} tone={isVeryClose ? 'mint' : 'cyan'}>
            <View style={s.distanceRow}>
              <MaterialCommunityIcons
                name={isVeryClose ? 'party-popper' : 'radar'}
                size={32}
                color={isVeryClose ? '#45EBC0' : glassColors.cyan}
              />
              <View>
                <Text style={s.distVal}>
                  {distanceMeters < 1000
                    ? `${distanceMeters} MÉT`
                    : `${(distanceMeters / 1000).toFixed(1)} KM`}
                </Text>
                <Text style={s.distDesc}>
                  Khoảng cách thẳng tới {friendName}
                </Text>
              </View>
            </View>

            <View style={s.sensorFooter}>
              <View style={s.sensorPill}>
                <MaterialCommunityIcons name="compass" size={16} color="#ABC9EF" />
                <Text style={s.sensorText}>
                  {hasSensor ? `Góc xoay: ${Math.round(deviceHeading)}°` : 'Cảm biến mô phỏng'}
                </Text>
              </View>
              <View style={s.sensorPill}>
                <MaterialCommunityIcons name="crosshairs" size={16} color="#ABC9EF" />
                <Text style={s.sensorText}>Mục tiêu: {Math.round(targetBearing)}°</Text>
              </View>
            </View>
          </GlassSurface>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  targetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(10, 32, 70, 0.7)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(72, 227, 255, 0.3)',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    borderColor: glassColors.cyan,
  },
  avatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(72, 227, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: glassColors.cyan,
  },
  avatarInitial: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
  },
  friendTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  friendSub: {
    fontSize: 12,
    color: glassColors.cyan,
    marginTop: 2,
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerHud: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRingOuter: {
    width: SCREEN_WIDTH * 0.78,
    height: SCREEN_WIDTH * 0.78,
    borderRadius: (SCREEN_WIDTH * 0.78) / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(72, 227, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRingMiddle: {
    width: SCREEN_WIDTH * 0.54,
    height: SCREEN_WIDTH * 0.54,
    borderRadius: (SCREEN_WIDTH * 0.54) / 2,
    borderWidth: 1,
    borderColor: 'rgba(72, 227, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radarRingInner: {
    width: SCREEN_WIDTH * 0.28,
    height: SCREEN_WIDTH * 0.28,
    borderRadius: (SCREEN_WIDTH * 0.28) / 2,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(72, 227, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crosshairV: {
    position: 'absolute',
    width: 1,
    height: SCREEN_WIDTH * 0.78,
    backgroundColor: 'rgba(72, 227, 255, 0.18)',
  },
  crosshairH: {
    position: 'absolute',
    height: 1,
    width: SCREEN_WIDTH * 0.78,
    backgroundColor: 'rgba(72, 227, 255, 0.18)',
  },
  radarSweepWrap: {
    position: 'absolute',
    width: SCREEN_WIDTH * 0.78,
    height: SCREEN_WIDTH * 0.78,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  radarSweepGradient: {
    width: (SCREEN_WIDTH * 0.78) / 2,
    height: (SCREEN_WIDTH * 0.78) / 2,
    borderTopLeftRadius: (SCREEN_WIDTH * 0.78) / 2,
    alignSelf: 'flex-end',
  },
  arrowContainer: {
    position: 'absolute',
    width: 120,
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowGlow: {
    shadowColor: glassColors.cyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 18,
    elevation: 12,
  },
  bottomPanel: {
    paddingHorizontal: 20,
    zIndex: 10,
  },
  glassInfo: {
    borderRadius: 22,
    padding: 16,
  },
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
  },
  distVal: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1,
  },
  distDesc: {
    fontSize: 13,
    color: glassColors.muted,
    marginTop: 2,
  },
  sensorFooter: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(152, 211, 255, 0.15)',
    paddingTop: 10,
  },
  sensorPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingVertical: 6,
    borderRadius: 10,
  },
  sensorText: {
    fontSize: 11.5,
    color: '#D4ECFF',
    fontWeight: '600',
  },
});
