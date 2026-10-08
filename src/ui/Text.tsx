import React from 'react';
import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';
import { useAppTheme } from './theme';
import {useLanguage,translate} from '../i18n/languages';
export function Text({ style, ...props }: TextProps) {
  const language=useLanguage();
  const { theme } = useAppTheme();
  const flattened = StyleSheet.flatten(style);
  const weight = Number(flattened?.fontWeight || 400);
  const fontFamily = flattened?.fontFamily || (weight >= 700 ? 'MyMapBold' : weight >= 500 ? 'MyMapSemiBold' : 'MyMapRegular');
  const children=typeof props.children==='string'?translate(props.children,language):Array.isArray(props.children)?props.children.map(child=>typeof child==='string'?translate(child,language):child):props.children;
  return <NativeText {...props} accessibilityLabel={props.accessibilityLabel?translate(props.accessibilityLabel,language):undefined} style={[{ fontFamily:['ar','he','hi','zh','ja','ko'].includes(language)?undefined:fontFamily, color: theme.colors.text, writingDirection:language==='ar'||language==='he'?'rtl':'auto' }, style]}>{children}</NativeText>;
}
