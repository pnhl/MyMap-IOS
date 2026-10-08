import React from 'react';
import {
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface } from '../ui/glass';
import {
  type LiveTripSession,
  formatTripShareMessage,
} from '../services/liveTripShare';

interface LiveTripCardProps {
  session: LiveTripSession | null;
  onEndTrip: () => void;
  style?: StyleProp<ViewStyle>;
}

export function LiveTripCard({ session, onEndTrip, style }: LiveTripCardProps) {
  if (!session || !session.isActive) return null;

  const distKm = (session.remainingDistanceMeters / 1000).toFixed(1);
  const speed = Math.round(session.currentSpeedKmh);

  const handleShare = async () => {
    try {
      const msg = formatTripShareMessage(session);
      await Share.share({
        message: msg,
        title: `Chuyến đi tới ${session.destination.name}`,
      });
    } catch { }
  };

  return (
    <GlassSurface style={[s.card, style]}>
      {/* Header with live pulsing dot */}
      <View style={s.header}>
        <View style={s.pulseRow}>
          <View style={s.pulseDot} />
          <Text style={s.badgeText}>CHUYẾN ĐI TRỰC TIẾP</Text>
        </View>

        <Pressable hitSlop={10} onPress={handleShare} style={s.shareBtn}>
          <MaterialCommunityIcons name="share-variant" size={16} color="#52E3FF" />
          <Text style={s.shareText}>Chia sẻ</Text>
        </Pressable>
      </View>

      {/* Destination & ETA row */}
      <View style={s.mainRow}>
        <View style={s.destColumn}>
          <Text style={s.destLabel}>Điểm đến:</Text>
          <Text style={s.destName} numberOfLines={1}>
            {session.destination.name}
          </Text>
        </View>

        <View style={s.etaColumn}>
          <Text style={s.etaValue}>~{session.etaMinutes}</Text>
          <Text style={s.etaUnit}>phút</Text>
        </View>
      </View>

      {/* Stats bar (Remaining km, speed, origin) */}
      <View style={s.statsBar}>
        <View style={s.statItem}>
          <MaterialCommunityIcons name="map-marker-distance" size={15} color="#52E3FF" />
          <Text style={s.statText}>Còn {distKm} km</Text>
        </View>
        <View style={s.divider} />
        <View style={s.statItem}>
          <MaterialCommunityIcons name="speedometer" size={15} color="#50F59C" />
          <Text style={s.statText}>{speed} km/h</Text>
        </View>
        <View style={s.divider} />
        <Pressable onPress={onEndTrip} style={s.endBtn}>
          <MaterialCommunityIcons name="stop-circle-outline" size={15} color="#FF6688" />
          <Text style={s.endBtnText}>Kết thúc</Text>
        </Pressable>
      </View>
    </GlassSurface>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: 'rgba(3, 17, 48, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(82, 227, 255, 0.45)',
    shadowColor: '#52E3FF',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#50F59C',
  },
  badgeText: {
    color: '#50F59C',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(82, 227, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(82, 227, 255, 0.3)',
  },
  shareText: {
    color: '#52E3FF',
    fontSize: 11,
    fontWeight: '700',
  },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  destColumn: {
    flex: 1,
    gap: 2,
    marginRight: 12,
  },
  destLabel: {
    color: '#8EB8E5',
    fontSize: 11,
    fontWeight: '600',
  },
  destName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  etaColumn: {
    alignItems: 'flex-end',
  },
  etaValue: {
    color: '#52E3FF',
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 24,
  },
  etaUnit: {
    color: '#8EB8E5',
    fontSize: 10,
    fontWeight: '700',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(4, 24, 64, 0.65)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(82, 227, 255, 0.2)',
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  statText: {
    color: '#D2ECFF',
    fontSize: 11.5,
    fontWeight: '700',
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(82, 227, 255, 0.2)',
  },
  endBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  endBtnText: {
    color: '#FF6688',
    fontSize: 11.5,
    fontWeight: '800',
  },
});
