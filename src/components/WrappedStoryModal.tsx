import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  Pressable,
  Share,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GlassButton, GlassChip, glassColors } from '../ui/glass';
import { Text } from '../ui/Text';
import { generateWeeklyWrapped, WrappedStats } from '../services/mapWrapped';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function WrappedStoryModal({ visible, onClose }: Props) {
  const [data, setData] = useState<WrappedStats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const[error,setError]=useState('');
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(0);
  const generation=useRef(0);
  const [period,setPeriod]=useState<'week'|'month'|'year'>('week');

  useEffect(() => {
    if (visible) {
      setCurrentSlideIndex(0);
      loadWrapped();
    }
    return()=>{generation.current++;};
  }, [visible,period]);

  async function loadWrapped() {
    const token=++generation.current;setLoading(true);setData(null);setError('');
    try {
      const res = await generateWeeklyWrapped(period);
      if(token===generation.current)setData(res);
    } catch(e) {
      if(token===generation.current)setError(e instanceof Error?e.message:'Chưa đọc được dữ liệu hành trình.');
    } finally {
      if(token===generation.current)setLoading(false);
    }
  }

  function handleNext() {
    if (!data) return;
    if (currentSlideIndex < data.slides.length - 1) {
      setCurrentSlideIndex(prev => prev + 1);
    } else {
      onClose();
    }
  }

  function handlePrev() {
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex(prev => prev - 1);
    }
  }

  async function handleShare() {
    if (!data) return;
    const msg =
      `🎉 MyMap Wrapped · Tuần ${data.weekLabel}\n` +
      `🚀 Quãng đường: ${data.totalDistanceKm} km\n` +
      `📍 Điểm hẹn: ${data.topPlaceName}\n` +
      `📸 Kỷ niệm: ${data.photoCount} ảnh · ${data.hangoutCount} lần cụng máy\n` +
      `👑 Danh hiệu: ${data.titleBadge}\n\n` +
      `#MyMap #MyMapWrapped #ZenlyVibes`;
    await Share.share({
      title: `MyMap Wrapped - ${data.weekLabel}`,
      message: msg,
    });
  }

  if (!visible) return null;

  const currentSlide = data?.slides[currentSlideIndex];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        {loading || !currentSlide ? (
          <View style={s.loadingContainer}>
            {loading&&<ActivityIndicator size="large" color={glassColors.cyan} />}
            <Text style={s.loadingText}>{error||'Đang tổng hợp dữ liệu hành trình...'}</Text>
            {!!error&&<><GlassButton onPress={()=>void loadWrapped()}><Text>Thử lại</Text></GlassButton><GlassButton onPress={onClose}><Text>Đóng</Text></GlassButton></>}
          </View>
        ) : (
          <View style={s.storyContainer}>
            <LinearGradient
              colors={['#06163A', currentSlide.bgColor || '#0C2B68', '#020B1D']}
              style={StyleSheet.absoluteFill}
            />

            {/* Top progress bars */}
            <View style={{flexDirection:'row',gap:8,padding:16}}>{(['week','month','year']as const).map((p,i)=><GlassChip key={p} label={['Tuần','Tháng','Năm'][i]!} active={p===period} onPress={()=>setPeriod(p)}/>)}</View>
            <View style={s.progressRow}>
              {data.slides.map((_, idx) => (
                <View key={idx} style={s.progressBarTrack}>
                  <View
                    style={[
                      s.progressBarFill,
                      {
                        width:
                          idx < currentSlideIndex
                            ? '100%'
                            : idx === currentSlideIndex
                            ? '100%'
                            : '0%',
                      },
                    ]}
                  />
                </View>
              ))}
            </View>

            {/* Header info */}
            <View style={s.headerRow}>
              <View style={s.brandBadge}>
                <MaterialCommunityIcons name="star-face" size={18} color="#FFD700" />
                <Text style={s.brandTitle}>MYMAP WRAPPED</Text>
              </View>
              <Pressable onPress={onClose} style={s.closeBtn}>
                <MaterialCommunityIcons name="close" size={24} color="#FFF" />
              </Pressable>
            </View>

            {/* Slide Content */}
            <View style={s.contentArea}>
              <View style={s.iconGlowWrap}>
                <MaterialCommunityIcons
                  name={currentSlide.icon as any}
                  size={64}
                  color="#FFF"
                />
              </View>

              <View style={s.pillHighlight}>
                <Text style={s.highlightText}>{currentSlide.highlight}</Text>
              </View>

              <Text style={s.slideCategory}>{currentSlide.title}</Text>
              <Text style={s.slideHeadline}>{currentSlide.headline}</Text>
              <Text style={s.slideDesc}>{currentSlide.description}</Text>
            </View>

            {/* Tap areas for prev / next */}
            <View style={s.tapZones}>
              <Pressable style={s.tapLeft} onPress={handlePrev} />
              <Pressable style={s.tapRight} onPress={handleNext} />
            </View>

            {/* Footer buttons */}
            <View style={s.footer}>
              <GlassButton tone="purple" onPress={handleShare} style={s.shareBtn}>
                <MaterialCommunityIcons name="share-variant" size={18} color="#FFF" />
                <Text style={s.shareText}>Chia sẻ khoảnh khắc</Text>
              </GlassButton>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: glassColors.muted,
  },
  storyContainer: {
    width: '100%',
    height: '100%',
    paddingTop: 46,
    paddingBottom: 32,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
  },
  progressRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 16,
  },
  progressBarTrack: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFF',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  brandBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  brandTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFD700',
    letterSpacing: 1,
  },
  closeBtn: {
    padding: 6,
  },
  contentArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 5,
  },
  iconGlowWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#FFF',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  pillHighlight: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  highlightText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: 1,
  },
  slideCategory: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ABC9EF',
    letterSpacing: 2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  slideHeadline: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 14,
    lineHeight: 34,
  },
  slideDesc: {
    fontSize: 15,
    color: '#D4ECFF',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: SCREEN_WIDTH * 0.8,
  },
  tapZones: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    zIndex: 1,
    top: 90,
    bottom: 90,
  },
  tapLeft: {
    flex: 1,
  },
  tapRight: {
    flex: 2,
  },
  footer: {
    zIndex: 10,
    alignItems: 'center',
  },
  shareBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  shareText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
});
