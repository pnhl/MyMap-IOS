import React, { PropsWithChildren } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Text } from './Text';
import { useAppTheme } from './theme';

export type LayoutClass = 'narrow' | 'phone' | 'foldable' | 'tablet';
export type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
export type AccentTone = 'cyan' | 'violet' | 'rose' | 'mint' | 'blue';
export function useResponsiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const layout: LayoutClass = width < 360 ? 'narrow' : width < 600 ? 'phone' : width < 900 ? 'foldable' : 'tablet';
  const gutter = width < 360 ? 14 : width < 600 ? 16 : 24;
  const maxContent = width >= 900 ? 1080 : width >= 600 ? 840 : 720;
  return { width, height, fontScale, layout, gutter, maxContent, isWide: width >= 600, isLandscape: width > height };
}
export const glassColors = {
  bg: '#111726', bgRaised: '#1E273A', text: '#F7F9FF', muted: '#B4BED3', faint: '#8190AC',
  cyan: '#829AFF', blue: '#AFBCE8', purple: '#AFBCE8', red: '#F292A3', green: '#9BCABB',
  glass: '#1E273A', glassStrong: '#1E273A', border: 'rgba(184,204,210,.18)', borderStrong: 'rgba(184,204,210,.35)',
};
export function AmbientBackdrop() {
  const { theme } = useAppTheme();
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.bg }]} />

  </View>;
}
function GlassBackdrop({ intensity = 46, color }: { intensity?: number; color: string }) {
  return Platform.OS === 'ios' ? <><View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }]} /><BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} /></> : <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: color }]} />;
}
export function GlassSurface({ children, style, intensity = 46, tone = 'blue' }: PropsWithChildren<{ style?: StyleProp<ViewStyle>; intensity?: number; tone?: AccentTone }>) {
  const { theme } = useAppTheme();
  const solid = theme.layout.surface === 'solid';
  const outline = theme.layout.surface === 'outline';
  return <View style={[s.shell, {
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.bgRaised,
    shadowColor: theme.colors.shadow,
    borderRadius: theme.radius.surface,
    borderWidth: outline ? 1.35 : solid ? 0 : .8,
    shadowOpacity: 0,
  }, style]}>
    {!solid && <GlassBackdrop intensity={intensity} color={outline ? `${theme.colors.bg}C8` : theme.colors.glassStrong} />}
    {!solid && !outline && <LinearGradient pointerEvents="none" colors={theme.surfaceGradient} style={StyleSheet.absoluteFill} />}
    {!solid && <LinearGradient pointerEvents="none" colors={theme.surfaceTopLight} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.topLight} />}
    {!solid && <View pointerEvents="none" style={[s.edgeLight, { borderRadius: theme.radius.surface, borderColor: theme.colors.border }]} />}{children}
  </View>;
}
export function GlassButton({ children, onPress, style, tone = 'blue', disabled = false, accessibilityLabel }: PropsWithChildren<{ onPress?: () => void; style?: StyleProp<ViewStyle>; tone?: 'blue' | 'purple' | 'red' | 'neutral'; disabled?: boolean; accessibilityLabel?: string }>) {
  const { theme } = useAppTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, { borderColor: tone === 'neutral' ? theme.colors.border : 'transparent', shadowColor: theme.colors.shadow, borderRadius: theme.radius.control }, pressed && s.pressed, disabled && s.disabled, style]}>
    <LinearGradient pointerEvents="none" colors={theme.buttonGradients[tone]} style={StyleSheet.absoluteFill} />

    <View style={s.buttonContent}>{children}</View>
  </Pressable>;
}
export function GlassChip({ label, active, onPress, disabled=false }: { label: string; active?: boolean; onPress?: () => void; disabled?: boolean }) {
  const { theme } = useAppTheme();
  return <Pressable disabled={disabled} accessibilityRole="button" accessibilityState={{ selected: active,disabled }} onPress={onPress} style={({ pressed }) => [s.chip, { borderColor: active ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.glassStrong, borderRadius: Math.max(10, theme.radius.control - 3),opacity:disabled?0.5:1 }, active && { shadowColor: theme.colors.primary }, pressed && s.pressed]}>
    {active && <LinearGradient colors={theme.activeGradient} style={StyleSheet.absoluteFill} />}<Text style={[s.chipText, { color: active ? theme.colors.text : theme.colors.muted }]}>{label}</Text>
  </Pressable>;
}
export function IconBadge({ name, tone = 'cyan', size = 24, diameter = 46 }: { name: IconName; tone?: AccentTone; size?: number; diameter?:number }) {
  const { theme } = useAppTheme();
  const dynamicTones: Record<AccentTone, string> = { cyan: theme.colors.primary, violet: theme.colors.secondary, rose: theme.colors.danger, mint: theme.colors.success, blue: theme.colors.primary };
  const color = dynamicTones[tone];
  return <View style={[s.iconBadge, { borderColor: 'transparent', backgroundColor: `${color}12`, shadowColor: theme.colors.shadow,width:diameter,height:diameter,borderRadius:Math.min(15,diameter*.34) }]}><MaterialCommunityIcons name={name} size={size} color={color} /></View>;
}
export function ScreenQuote({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) {
  const { theme } = useAppTheme();
  return <View pointerEvents="none" style={[s.quoteWrap, style]}><Text style={[s.quoteText, { color: theme.colors.primary }]}>{text}</Text><View style={[s.quoteUnderline, { backgroundColor: theme.colors.primary }]} /></View>;
}
export function TopIconButton({ icon, onPress, hasBadge, badgeColor, accessibilityLabel, disabled, tone }: { icon: IconName; onPress?: () => void; hasBadge?: boolean; badgeColor?: string; accessibilityLabel?: string; disabled?: boolean; tone?: AccentTone }) {
  const { theme } = useAppTheme();
  const isRose = tone === 'rose';
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: disabled || !onPress }} disabled={disabled || !onPress} onPress={onPress} style={({ pressed }) => [s.topBtn, { borderColor: 'transparent', backgroundColor: isRose ? `${theme.colors.danger}18` : theme.colors.bgRaised, shadowColor: isRose ? theme.colors.danger : theme.colors.shadow, borderRadius: 24 }, pressed && s.pressed, disabled && s.disabled]}>
    <MaterialCommunityIcons pointerEvents="none" name={icon} size={24} color={isRose ? theme.colors.danger : theme.colors.muted} />{hasBadge && <View pointerEvents="none" style={[s.badgeDot, { backgroundColor: badgeColor || theme.colors.secondary }]} />}
  </Pressable>;
}
export function GlassSegmentedTabs<T extends string>({ tabs, active, onChange }: { tabs: { key: T; label: string; icon?: IconName }[]; active: T; onChange: (key: T) => void }) {
  const { theme } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const stacked = tabs.length > 2 && (width < 430 || fontScale > 1.2);
  return <View collapsable={false} style={[s.segmentedContainer,{backgroundColor:theme.colors.bgRaised}]}><View collapsable={false} style={s.segmentedInner}>{tabs.map(t => <Pressable key={t.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: t.key === active }} onPress={() => onChange(t.key)} style={({ pressed }) => [s.segmentedTab, { borderRadius: Math.max(9, theme.radius.control - 3),backgroundColor:t.key===active?theme.colors.primary:theme.colors.bgRaised }, stacked && { flexDirection: 'column', gap: 3, paddingVertical: 8 }, pressed && {opacity:.8}]}>
    {t.icon && <MaterialCommunityIcons pointerEvents="none" name={t.icon} size={20} color={t.key === active ? theme.colors.bg : theme.colors.text} />}<Text pointerEvents="none" numberOfLines={1} maxFontSizeMultiplier={1.3} style={[s.segmentedText, { color: t.key === active ? theme.colors.bg : theme.colors.text }]}>{t.label}</Text></Pressable>)}</View></View>;
}
const s = StyleSheet.create({
  shell: { overflow: 'hidden', borderRadius: 23, borderWidth: .8, borderColor: glassColors.border, backgroundColor: 'rgba(13,29,43,.78)' }, topLight: { position: 'absolute', top: 0, left: 16, right: 16, height: 1 }, edgeLight: { ...StyleSheet.absoluteFill, borderRadius: 23, borderTopWidth: .6, borderColor: 'rgba(231,243,248,.10)' },
  button: { overflow: 'hidden', minHeight: 48, borderRadius: 15, borderWidth: .8, justifyContent: 'center' }, buttonEdge: { ...StyleSheet.absoluteFill, borderRadius: 15, borderTopWidth: .7, borderColor: 'rgba(255,255,255,.12)' }, buttonContent: { paddingHorizontal: 15, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' }, pressed: { transform: [{ scale: .985 }], opacity: .9 }, disabled: { opacity: .42 },
  chip: { minHeight: 40, overflow: 'hidden', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 13, borderWidth: .8, borderColor: glassColors.border, backgroundColor: 'rgba(16,34,49,.86)', alignItems: 'center', justifyContent: 'center' }, chipActive: { borderColor: '#6BC3D3' }, chipText: { color: glassColors.muted, fontWeight: '600', fontSize: 12.5 },
  iconBadge: { width: 46, height: 46, borderRadius: 15, overflow: 'hidden', borderWidth: .8, alignItems: 'center', justifyContent: 'center' },
  quoteWrap: { alignItems: 'flex-end', paddingVertical: 4 }, quoteText: { fontFamily: 'MyMapScript', fontSize: 19, lineHeight: 24, color: '#9DD9FF', textAlign: 'right', maxWidth: 220 }, quoteUnderline: { width: 47, height: 2, backgroundColor: '#44DFFF', marginTop: 4, marginRight: 13, transform: [{ rotate: '-13deg' }] },
  topBtn: { width: 48, height: 48, borderRadius: 24, overflow: 'hidden', borderWidth: .8, borderColor: 'rgba(148,199,255,.24)', alignItems: 'center', justifyContent: 'center' }, topBtnRose: { borderColor: 'rgba(233,121,142,.45)' }, badgeDot: { position: 'absolute', top: 3, right: 3, width: 7, height: 7, borderRadius: 4, borderWidth: 1, borderColor: '#DCE6EF' },
  segmentedContainer: { borderRadius: 17, padding: 3 }, segmentedInner: { flexDirection: 'row', gap: 3 }, segmentedTab: { flex: 1, minHeight: 42, borderRadius: 13, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 6 }, segmentedActive: { borderWidth: .8 }, segmentedText: { color: glassColors.muted, fontWeight: '600', fontSize: 12 },
});
