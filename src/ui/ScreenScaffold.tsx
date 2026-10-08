import React from 'react';
import { Platform, Pressable, ScrollView, StatusBar, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AmbientBackdrop, GlassSurface, IconBadge, ScreenQuote, glassColors, type AccentTone, type IconName, useResponsiveLayout } from './glass';
import { AppHeader } from './AppHeader';
import { AppDock } from './AppDock';
import { Text } from './Text';
import { useAppTheme } from './theme';
import {FloatingActions, type FloatingAction} from './FloatingActions';
const ROOTS = new Set(['Map','Timeline','Memories','Friends','Profile']);
export function ScreenScaffold({ title, subtitle, icon, iconTone = 'cyan', children, scroll = true, right, quote, hideTitle = false, onSearch, contentStyle, header = true, overlay, actions = [], refreshControl }: {
  title: string; subtitle?: string; icon?: IconName; iconTone?: AccentTone; children: React.ReactNode; scroll?: boolean; right?: React.ReactNode; quote?: string; hideTitle?: boolean; onSearch?: () => void; contentStyle?: StyleProp<ViewStyle>; header?: boolean; overlay?:React.ReactNode; actions?:FloatingAction[]; refreshControl?:React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const r = useResponsiveLayout(); const nav = useNavigation<any>(); const route = useRoute(); const insets = useSafeAreaInsets(); const root = ROOTS.has(route.name); const { theme } = useAppTheme();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0);
  const compact = theme.layout.density === 'compact';
  const centered = theme.layout.header === 'centered';
  const technical = theme.layout.header === 'technical';
  const body = <View style={[s.content,{ paddingHorizontal: r.gutter,paddingLeft:r.isLandscape?Math.max(r.gutter,insets.left+68):r.gutter, maxWidth: r.maxContent, gap: compact ? 10 : theme.layout.density === 'airy' ? 19 : 15 },contentStyle]}>
    {header && <AppHeader title={title} subtitle={subtitle} back={!root && nav.canGoBack()} smart={route.name === 'Smart'} settings={route.name === 'Profile'} onSearch={onSearch} />}
    {!header && !hideTitle && <View style={[s.heading, centered && s.headingCentered, compact && { marginTop: 2, marginBottom: 0 }]}>
      <View style={[s.header, centered && s.headerCentered]}>{icon && <IconBadge name={icon} tone={iconTone} size={technical ? 22 : 28} diameter={technical ? 38 : 46} />}<View style={[s.copy, centered && s.copyCentered]}><Text style={[s.title,{ color: theme.colors.text }, centered && s.titleCentered, technical && s.titleTechnical, r.width < 360 && { fontSize: technical ? 22 : 26 }]}>{title}</Text>{subtitle && <Text style={[s.subtitle,{ color: theme.colors.muted }, centered && s.textCentered, technical && s.subtitleTechnical]}>{subtitle}</Text>}</View>{right}</View>
      {quote && !technical && <ScreenQuote text={quote} style={centered ? s.quoteCentered : undefined} />}
    </View>}
    {(header || hideTitle) && !!right && <View style={s.right}>{right}</View>}
    {children}
  </View>;
  return <SafeAreaView edges={[]} style={[s.root,{ backgroundColor: theme.colors.bg }]}><AmbientBackdrop />{scroll ? <ScrollView style={s.foreground} refreshControl={refreshControl} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: topInset + 8, paddingBottom: (actions.length?170:88) + Math.max(insets.bottom,8) }}>{body}</ScrollView> : <View style={[s.nonScroll,s.foreground,{ paddingTop: topInset, paddingBottom: (actions.length?160:82) + insets.bottom }]}>{body}</View>}<FloatingActions actions={actions}/>{overlay}{!root && route.name !== 'Login' && <AppDock />}</SafeAreaView>;
}
export function MetricCard({ value, label, accent, icon }: { value: string|number; label: string; accent?: string; icon?: IconName }) {
  const { theme } = useAppTheme();
  return <GlassSurface style={s.metric}><View style={s.metricTop}>{icon && <IconBadge name={icon} tone={accent === glassColors.purple ? 'violet' : 'cyan'} size={22} />}<Text style={[s.metricValue,{ color: theme.colors.text }]}>{value}</Text></View><Text style={[s.metricLabel,{ color: theme.colors.muted }]}>{label}</Text></GlassSurface>;
}
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) { const { theme }=useAppTheme(); return <View style={s.sectionRow}><Text style={[s.section,{ color: theme.colors.text }]}>{children}</Text>{action}</View>; }
export function EmptyGlass({ title, body, icon = 'map-marker-path', action }: { title: string; body: string; icon?: IconName; action?: React.ReactNode }) { const { theme }=useAppTheme(); return <GlassSurface style={s.empty}><IconBadge name={icon} size={28} /><View style={s.emptyCopy}><Text style={[s.emptyTitle,{ color: theme.colors.text }]}>{title}</Text><Text style={[s.subtitle,{ color: theme.colors.muted }]}>{body}</Text>{action && <View style={s.emptyAction}>{action}</View>}</View></GlassSurface>; }
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: glassColors.bg },
  foreground: { flex: 1, zIndex: 2, elevation: 2 },
  nonScroll: { flex: 1 },
  content: { width: '100%', alignSelf: 'center', gap: 16 },
  heading: { gap: 4, marginTop: 8, marginBottom: 4 },
  headingCentered: { alignItems: 'center', paddingHorizontal: 18, marginTop: 16, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCentered: { justifyContent: 'center', width: '100%' },
  copy: { flex: 1 },
  copyCentered: { flex: 0, alignItems: 'center', maxWidth: 520 },
  title: { fontSize: 29, lineHeight: 34, fontWeight: '700', color: '#fff', letterSpacing: -.7 },
  titleCentered: { textAlign: 'center', fontSize: 32, lineHeight: 37, fontWeight: '800', letterSpacing: -1.1 },
  titleTechnical: { fontSize: 24, lineHeight: 29, fontWeight: '600', letterSpacing: -.3 },
  subtitle: { color: glassColors.muted, fontSize: 13.5, lineHeight: 20, marginTop: 3, maxWidth: 560 },
  subtitleTechnical: { fontSize: 11, lineHeight: 16, letterSpacing: .35 },
  textCentered: { textAlign: 'center' },
  quoteCentered: { alignSelf: 'center', alignItems: 'center' },
  right: { flexDirection: 'row', justifyContent: 'flex-end' },
  metric: { flex: 1, minWidth: 110, padding: 15, minHeight: 96 },
  metricTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9 },
  metricValue: { color: '#fff', fontSize: 21, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -.35 },
  metricLabel: { color: glassColors.muted, fontSize: 11.5, lineHeight: 17, marginTop: 7 },
  sectionRow: { marginTop: 9, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  section: { flexShrink: 1, color: '#fff', fontWeight: '700', fontSize: 17.5, letterSpacing: -.25 },
  empty: { padding: 18, flexDirection: 'row', alignItems: 'flex-start', gap: 14, minHeight: 110 },
  emptyCopy: { flex: 1 },
  emptyTitle: { color: '#fff', fontWeight: '700', fontSize: 16.5 },
  emptyAction: { marginTop: 15 },
});
