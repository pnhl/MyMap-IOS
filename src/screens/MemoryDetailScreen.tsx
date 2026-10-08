import {TextInput} from '../ui/TextInput';
import { Text } from '../ui/Text';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, usePreventRemove, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { getPhotoPin, updatePhotoPin } from '../db/database';
import { removePhotoPin } from '../services/photoPins';
import { GlassButton, GlassSurface, TopIconButton, glassColors, useResponsiveLayout } from '../ui/glass';
import { EmptyGlass, ScreenScaffold, SectionTitle } from '../ui/ScreenScaffold';
import type { RootStackParamList } from '../navigation/types';
import type { PhotoPin } from '../types/photo';
import {DeviceAiComposer} from '../components/DeviceAiComposer';

type DetailRoute = NativeStackScreenProps<RootStackParamList, 'MemoryDetail'>['route'];

export default function MemoryDetailScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { params } = useRoute<DetailRoute>();
  const r = useResponsiveLayout();
  const [pin, setPin] = useState<PhotoPin | null>(null);
  const [title, setTitle] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);
  const mutation = useRef(false);
  const dirty = !!pin && (title !== (pin.title || '') || note !== (pin.note || '') || placeName !== (pin.placeName || '') || tags !== (pin.tags || ''));

  usePreventRemove(dirty || busy, ({ data }) => {
    if (mutation.current) return;
    Alert.alert('Chưa lưu thay đổi', 'Bạn muốn bỏ các thay đổi của kỷ niệm này?', [
      { text: 'Tiếp tục sửa', style: 'cancel' },
      { text: 'Bỏ thay đổi', style: 'destructive', onPress: () => nav.dispatch(data.action) },
    ]);
  });

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void getPhotoPin(params.photoId).then(value => {
      if (!active) return;
      setPin(value);
      setTitle(value?.title || '');
      setPlaceName(value?.placeName || '');
      setNote(value?.note || '');
      setTags(value?.tags || '');
    }).catch(() => {
      if (active) setError('Không thể đọc kỷ niệm. Hãy quay lại và thử mở lần nữa.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.photoId]));

  async function save() {
    if (!pin || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    try {
      const details = { title: title.trim() || null, placeName: placeName.trim() || null, note: note.trim() || null, tags: tags.trim() || null };
      await updatePhotoPin(pin.id, details);
      setPin({ ...pin, ...details });
      setTitle(details.title || '');
      setPlaceName(details.placeName || '');
      setNote(details.note || '');
      setTags(details.tags || '');
      Alert.alert('Đã lưu', 'Tên, ghi chú và thẻ đã được lưu trên thiết bị.');
    } catch (e) {
      Alert.alert('Không thể lưu', e instanceof Error ? e.message : String(e));
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }

  function confirmDelete() {
    if (!pin || mutation.current) return;
    const current = pin;
    Alert.alert('Xóa kỷ niệm?', 'Ảnh và ghi chú sẽ bị xóa khỏi MyMap trên thiết bị. Lịch sử GPS vẫn được giữ lại.', [
      { text: 'Hủy', style: 'cancel' },
      { text: 'Xóa', style: 'destructive', onPress: () => {
        if (mutation.current) return;
        mutation.current = true;
        setBusy(true);
        void removePhotoPin(current).then(() => setPin(null)).catch(e => {
          Alert.alert('Không thể xóa', e instanceof Error ? e.message : String(e));
        }).finally(() => {
          mutation.current = false;
          setBusy(false);
        });
      } },
    ]);
  }

  return <ScreenScaffold title="Chi tiết kỷ niệm" subtitle="Khoảnh khắc được lưu riêng trên thiết bị" icon="image-outline">
    {loading ? <ActivityIndicator color={glassColors.cyan} accessibilityLabel="Đang tải kỷ niệm" />
      : error ? <EmptyGlass icon="alert-circle-outline" title="Không thể tải kỷ niệm" body={error} />
      : !pin ? <EmptyGlass icon="image-off-outline" title="Kỷ niệm không còn tồn tại" body="Kỷ niệm này đã bị xóa. Quay lại thư viện để xem các ảnh khác." />
      : <>
        <Pressable accessibilityRole="button" accessibilityLabel="Xem ảnh toàn màn hình" onPress={() => setFullScreen(true)}>
          <GlassSurface style={s.photoWrap}><Image source={{ uri: pin.uri }} resizeMode="contain" style={[s.photo, { height: Math.min(r.height * .45, 440) }]} /></GlassSurface>
        </Pressable>
        <Text style={s.muted}>{new Date(pin.capturedAt).toLocaleString('vi-VN')}</Text>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <GlassSurface style={s.form}>
            <Field label="Tên kỷ niệm" value={title} onChangeText={setTitle} editable={!busy} maxLength={160} placeholder="Ví dụ: Một chiều ở Đà Lạt" />
            <Field label="Tên địa điểm" value={placeName} onChangeText={setPlaceName} editable={!busy} maxLength={200} placeholder="Đặt tên nơi bạn đã ghé" />
            <Field label="Ghi chú" value={note} onChangeText={setNote} editable={!busy} maxLength={4000} placeholder="Cảm xúc, người đồng hành, điều đáng nhớ…" multiline />
            <DeviceAiComposer key={pin.id} task="caption" facts={[title,placeName,new Date(pin.capturedAt).toLocaleString('vi-VN'),note].filter(Boolean).join('\n')} onUse={setNote} disabled={busy}/>
            <Field label="Thẻ (Tags)" value={tags} onChangeText={setTags} editable={!busy} maxLength={200} placeholder="#dulich #checkin #coffee" />
            <GlassButton disabled={busy || !dirty} onPress={() => void save()}><Text style={s.button}>{busy ? 'Đang xử lý…' : 'Lưu thay đổi'}</Text></GlassButton>
          </GlassSurface>
        </KeyboardAvoidingView>
        <SectionTitle>Địa điểm của kỷ niệm</SectionTitle>
        <GlassSurface style={s.form}>
          <Text style={s.muted}>{pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}</Text>
          <GlassButton tone="neutral" disabled={busy || dirty} onPress={() => nav.navigate('PlaceDetail', { name: pin.placeName || pin.title || 'Kỷ niệm', latitude: pin.latitude, longitude: pin.longitude })}><Text style={s.button}>Xem địa điểm</Text></GlassButton>
          {dirty && <Text style={s.muted}>Lưu thay đổi trước khi mở địa điểm.</Text>}
        </GlassSurface>
        <GlassButton tone="red" disabled={busy} onPress={confirmDelete}><Text style={s.button}>Xóa kỷ niệm này</Text></GlassButton>
        <Modal visible={fullScreen} animationType="fade" onRequestClose={() => setFullScreen(false)}>
          <View style={s.fullScreen}>
            <Image source={{ uri: pin.uri }} resizeMode="contain" style={StyleSheet.absoluteFill} />
            <View style={s.close}><TopIconButton icon="close" accessibilityLabel="Đóng ảnh" onPress={() => setFullScreen(false)} /></View>
          </View>
        </Modal>
      </>}
  </ScreenScaffold>;
}

function Field({ label, ...props }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput {...props} accessibilityLabel={label} placeholderTextColor={glassColors.faint} style={[s.input, props.multiline && s.note]} /></View>;
}

const s = StyleSheet.create({
  photoWrap: { overflow: 'hidden' }, photo: { width: '100%', backgroundColor: glassColors.bgRaised },
  form: { padding: 16, gap: 14 }, field: { gap: 7 }, label: { color: glassColors.text, fontWeight: '800' },
  input: { color: glassColors.text, borderColor: glassColors.border, borderWidth: 1, borderRadius: 13, padding: 12, minHeight: 48, backgroundColor: 'rgba(4,24,62,.65)' },
  note: { minHeight: 120, textAlignVertical: 'top' }, muted: { color: glassColors.muted, fontSize: 13, lineHeight: 19 },
  button: { color: '#fff', fontWeight: '800' }, fullScreen: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', right: 20, top: 60 },
});
