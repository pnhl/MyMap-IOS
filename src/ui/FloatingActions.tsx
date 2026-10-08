import React, {useCallback, useEffect, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';
import {ActivityIndicator, Keyboard, Pressable, StyleSheet, View} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useResponsiveLayout, type IconName} from './glass';
import {useAppTheme} from './theme';
import {Text} from './Text';

export type FloatingAction = {id:string; icon:IconName; label:string; onPress:()=>void; primary?:boolean; disabled?:boolean; busy?:boolean};
export function FloatingActions({actions}: {actions:FloatingAction[]}) {
  const {theme} = useAppTheme(), insets = useSafeAreaInsets(), r = useResponsiveLayout();
  const [keyboard, setKeyboard] = useState(false);
  useFocusEffect(useCallback(()=>{setKeyboard(false);},[]));
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow',()=>setKeyboard(true));
    const hidden = Keyboard.addListener('keyboardDidHide',()=>setKeyboard(false));
    return ()=>{shown.remove();hidden.remove();};
  },[]);
  if (keyboard || !actions.length) return null;
  return <View pointerEvents="box-none" style={[s.placement,{bottom:98+Math.max(insets.bottom,8),right:r.gutter+insets.right},r.isLandscape&&{bottom:82+insets.bottom}]}>
    <View style={s.row}>{actions.map(action=><Pressable key={action.id} accessibilityRole="button" accessibilityLabel={action.label}
      accessibilityState={{disabled:!!action.disabled,busy:!!action.busy}} disabled={action.disabled||action.busy}
      onPress={action.onPress} style={({pressed})=>[s.button,{backgroundColor:action.primary?theme.colors.primary:theme.colors.bgRaised,
        shadowColor:theme.colors.shadow,borderColor:theme.colors.border},pressed&&{transform:[{scale:.94}]},(action.disabled||action.busy)&&{opacity:.5}]}>
      {action.busy?<ActivityIndicator color={action.primary?theme.colors.bg:theme.colors.primary}/>:<MaterialCommunityIcons name={action.icon} size={23} color={action.primary?theme.colors.bg:theme.colors.text}/>}
      {action.primary&&<Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[s.label,{color:theme.colors.bg,maxWidth:Math.max(60,Math.min(136,r.width-2*r.gutter-(actions.length-1)*62-61))}]}>{action.label}</Text>}
    </Pressable>)}</View>
  </View>;
}
const s = StyleSheet.create({placement:{position:'absolute',zIndex:20,elevation:20},row:{flexDirection:'row',alignItems:'center',gap:10},
  button:{minWidth:52,minHeight:52,borderRadius:26,paddingHorizontal:15,borderWidth:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,
    shadowOffset:{width:0,height:4},shadowOpacity:.22,shadowRadius:10,elevation:5},label:{fontSize:13,fontWeight:'700',maxWidth:136}});
