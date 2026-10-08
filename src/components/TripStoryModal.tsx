import React from 'react';
import { Modal, StyleSheet, View, Image, Pressable, Share, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassSurface, GlassButton, IconBadge, glassColors, ScreenQuote } from '../ui/glass';
import { Text } from '../ui/Text';
import type { PhotoPin } from '../types/photo';

type Props = {
  visible: boolean;
  onClose: () => void;
  dayLabel: string;
  distanceKm: string;
  visitCount: number;
  movingDuration: string;
  photos: PhotoPin[];
};

export function TripStoryModal({
  visible,
  onClose,
  dayLabel,
  distanceKm,
  visitCount,
  movingDuration,
  photos,
}: Props) {
  async function handleShareStory() {
    const summary = `🌟 Hành trình MyMap · ${dayLabel}\n📍 Quãng đường: ${distanceKm} km\n🏛️ Điểm dừng chân: ${visitCount}\n⏱️ Thời gian di chuyển: ${movingDuration}\n📸 Kỷ niệm đã lưu: ${photos.length} ảnh\n\n#MyMap #TravelStory #Explore`;
    await Share.share({
      title: `Hành trình ${dayLabel}`,
      message: summary,
    });
  }

  const highlightPhoto = photos[0];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <GlassSurface style={s.card}>
          <View style={s.header}>
            <View style={s.titleGroup}>
              <IconBadge name="book-open-page-variant" tone="violet" size={24} />
              <View>
                <Text style={s.title}>Trip Story</Text>
                <Text style={s.sub}>{dayLabel}</Text>
              </View>
            </View>
            <Pressable onPress={onClose} style={s.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color="#D4ECFF" />
            </Pressable>
          </View>

          <ScrollView style={s.body} showsVerticalScrollIndicator={false}>
            {highlightPhoto ? (
              <View style={s.heroPhotoWrap}>
                <Image source={{ uri: highlightPhoto.uri }} style={s.heroPhoto} />
                <View style={s.photoBadge}>
                  <MaterialCommunityIcons name="map-marker" size={14} color="#5BE4FF" />
                  <Text style={s.photoPlace} numberOfLines={1}>{highlightPhoto.placeName || 'Khoảnh khắc nổi bật'}</Text>
                </View>
              </View>
            ) : (
              <View style={s.noPhotoBox}>
                <MaterialCommunityIcons name="map-marker-distance" size={48} color={glassColors.cyan} />
                <Text style={s.sub}>Hành trình tuyệt vời đã được lưu lại</Text>
              </View>
            )}

            <View style={s.metricsRow}>
              <View style={s.metric}>
                <Text style={s.metricNum}>{distanceKm}</Text>
                <Text style={s.metricUnit}>km di chuyển</Text>
              </View>
              <View style={s.metricDivider} />
              <View style={s.metric}>
                <Text style={s.metricNum}>{visitCount}</Text>
                <Text style={s.metricUnit}>điểm dừng chân</Text>
              </View>
              <View style={s.metricDivider} />
              <View style={s.metric}>
                <Text style={s.metricNum}>{movingDuration}</Text>
                <Text style={s.metricUnit}>thời gian lăn bánh</Text>
              </View>
            </View>

            {photos.length > 1 && (
              <View style={s.stripWrap}>
                <Text style={s.stripLabel}>Ảnh hành trình trong ngày ({photos.length})</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photoStrip}>
                  {photos.slice(0, 8).map(p => (
                    <Image key={p.id} source={{ uri: p.uri }} style={s.stripThumb} />
                  ))}
                </ScrollView>
              </View>
            )}

            <ScreenQuote text="Mỗi bước chân bạn đi là một trang câu chuyện đáng nhớ" style={s.quote} />
          </ScrollView>

          <View style={s.actions}>
            <GlassButton tone="neutral" style={s.btn} onPress={onClose}>
              <Text style={s.btnText}>Đóng</Text>
            </GlassButton>
            <GlassButton tone="blue" style={s.btn} onPress={handleShareStory}>
              <View style={s.btnRow}>
                <MaterialCommunityIcons name="share-variant" size={18} color="#fff" />
                <Text style={s.btnText}>Chia sẻ Story</Text>
              </View>
            </GlassButton>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(2,10,32,.88)', justifyContent: 'center', padding: 20 },
  card: { padding: 18, borderRadius: 24, maxHeight: '88%', width: '100%', maxWidth: 540, alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: '#fff', fontSize: 20, fontWeight: '800' },
  sub: { color: glassColors.muted, fontSize: 12 },
  closeBtn: { padding: 4 },
  body: { maxHeight: 440 },
  heroPhotoWrap: { width: '100%', height: 190, borderRadius: 16, overflow: 'hidden', position: 'relative', marginBottom: 14 },
  heroPhoto: { width: '100%', height: '100%' },
  photoBadge: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(3,20,51,.82)', borderWidth: 1, borderColor: 'rgba(88,211,255,.35)' },
  photoPlace: { color: '#E5F6FF', fontSize: 11, fontWeight: '700', maxWidth: 220 },
  noPhotoBox: { height: 120, borderRadius: 16, backgroundColor: 'rgba(5,28,70,.5)', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 },
  metricsRow: { flexDirection: 'row', backgroundColor: 'rgba(4,22,57,.65)', borderRadius: 16, padding: 12, alignItems: 'center', marginBottom: 14, borderWidth: 1, borderColor: 'rgba(102,189,245,.2)' },
  metric: { flex: 1, alignItems: 'center' },
  metricNum: { color: '#fff', fontSize: 18, fontWeight: '800' },
  metricUnit: { color: glassColors.muted, fontSize: 10.5, marginTop: 2 },
  metricDivider: { width: 1, height: 32, backgroundColor: 'rgba(127,191,245,.2)' },
  stripWrap: { marginBottom: 14 },
  stripLabel: { color: '#C8E3FF', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  photoStrip: { gap: 8 },
  stripThumb: { width: 62, height: 62, borderRadius: 12 },
  quote: { marginVertical: 8 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
