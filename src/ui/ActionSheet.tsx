import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from './Text';
import { TopIconButton } from './glass';
import { useAppTheme } from './theme';

export function ActionSheet({ visible, onClose, title, subtitle, children }: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <View style={s.overlay}>
      <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`Đóng ${title.toLowerCase()}`} onPress={onClose} />
      <View accessibilityViewIsModal style={[s.sheet, { backgroundColor: theme.colors.bgRaised, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={[s.handle, { backgroundColor: theme.colors.faint }]} />
        <View style={s.header}>
          <View style={s.copy}><Text style={s.title}>{title}</Text>{subtitle && <Text style={[s.subtitle, { color: theme.colors.muted }]}>{subtitle}</Text>}</View>
          <TopIconButton icon="close" accessibilityLabel={`Đóng ${title.toLowerCase()}`} onPress={onClose} />
        </View>
        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,14,18,.55)' },
  sheet: { width: '100%', maxWidth: 640, maxHeight: '88%', alignSelf: 'center', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10 },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', opacity: .5 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 },
  title: { fontSize: 23, lineHeight: 29, fontWeight: '700', letterSpacing: -.4 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 5 },
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 20, gap: 12 },
});
