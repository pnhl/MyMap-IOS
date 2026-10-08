import React, { useCallback, useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useResponsiveLayout, type IconName } from './glass';
import { Text } from './Text';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useAppTheme } from './theme';

const canonical: { name: string; label: string; icon: IconName }[] = [
  { name: 'Friends', label: 'Bạn bè', icon: 'account-multiple-outline' },
  { name: 'Timeline', label: 'Hành trình', icon: 'map-marker-path' },
  { name: 'Map', label: 'Bản đồ', icon: 'map-marker-radius' },
  { name: 'Memories', label: 'Kỷ niệm', icon: 'image-multiple-outline' },
  { name: 'Profile', label: 'Cá nhân', icon: 'account-outline' },
];

export function AppDock({ tabs }: { tabs?: BottomTabBarProps }) {
  const nav = useNavigation<any>();
  const route = useRoute();
  const r = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const { theme } = useAppTheme();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useFocusEffect(useCallback(()=>{setKeyboardOpen(false);},[]));

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const active = tabs ? tabs.state.routes[tabs.state.index]?.name : route.name;

  function select(name: string) {
    if (name === active) return;
    if (tabs) {
      const destination = tabs.state.routes.find(x => x.name === name);
      if (destination) {
        const event = tabs.navigation.emit({ type: 'tabPress', target: destination.key, canPreventDefault: true });
        if (!event.defaultPrevented) tabs.navigation.navigate(name);
      }
    } else {
      // React Navigation 7 navigate() updates an existing Tabs route without
      // removing the detail screen above it. Return to Tabs before selecting.
      if (typeof nav.popTo === 'function') nav.popTo('Tabs', { screen: name });
      else nav.navigate('Tabs', { screen: name });
    }
  }

  const bottom = Math.max(insets.bottom, 8);
  const compact = theme.layout.dock === 'compact';
  const landscapeCompact = r.isLandscape;
  const dockCompact = compact || landscapeCompact;
  const landscapeWidth = Math.min(560, Math.max(420, r.width - 220));
  const landscapeInset = Math.max(16, (r.width - landscapeWidth) / 2);
  if (keyboardOpen) return null;

  if(r.isLandscape)return <View style={{position:'absolute',left:insets.left+8,top:insets.top+54,bottom:Math.max(insets.bottom,8),width:48,zIndex:30,justifyContent:'center'}}><View style={{gap:2}}>{canonical.map(item=><Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected:active===item.name}} onPress={()=>select(item.name)} style={{height:44,width:48,alignItems:'center',justifyContent:'center'}}><View style={{height:36,width:36,borderRadius:18,backgroundColor:'#FFFFFF',borderWidth:item.name===active?2:0,borderColor:'#4464F6',alignItems:'center',justifyContent:'center'}}><MaterialCommunityIcons name={item.icon} size={21} color={item.name===active?'#4464F6':'#526080'}/></View></Pressable>)}</View></View>;
  return <View pointerEvents="box-none" style={[s.position,landscapeCompact&&{left:landscapeInset,right:landscapeInset},{height:(dockCompact?58:70)+bottom+8,paddingBottom:bottom,paddingHorizontal:landscapeCompact?0:r.isWide?Math.max(20,(r.width-460)/2):12}]}>
    <View pointerEvents="box-none" style={s.dock}>
      {canonical.map(item=>{
        const selected=item.name===active||(active==='Settings'&&item.name==='Profile')||(active==='Smart'&&item.name==='Profile')||(active==='Heatmap'&&item.name==='Timeline')||(active==='SOS'&&item.name==='Friends');
        const central=item.name==='Map';const destination=tabs?.state.routes.find(x=>x.name===item.name);
        return <Pressable key={item.name} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected}} onPress={()=>select(item.name)} onLongPress={destination?()=>tabs?.navigation.emit({type:'tabLongPress',target:destination.key}):undefined} style={({pressed})=>[s.item,pressed&&{opacity:.7}]}>
          <View style={[s.bubble,central&&s.central,{backgroundColor:'#FFFFFF',borderRadius:central?29:24,borderWidth:selected?2:0,borderColor:'#4464F6'}]}>
            <MaterialCommunityIcons name={item.icon} size={central?28:24} color={selected?'#4464F6':'#526080'}/>
          </View>
          <Text allowFontScaling={false} numberOfLines={1} style={[s.label,s.mapLabel,{color:selected?'#3256DD':'#526080'},selected&&{fontWeight:'800'}]}>{item.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const s=StyleSheet.create({
 position:{position:'absolute',left:0,right:0,bottom:0,zIndex:30,elevation:30},
 dock:{flex:1,flexDirection:'row',alignItems:'center',justifyContent:'space-around',borderRadius:34,paddingHorizontal:3,paddingVertical:3},
 item:{flex:1,minWidth:48,minHeight:64,alignItems:'center',justifyContent:'center',gap:3},
 bubble:{width:48,height:48,borderRadius:23,alignItems:'center',justifyContent:'center'},central:{width:57,height:57,borderRadius:29,marginTop:-12,shadowColor:'#4464F6',shadowOpacity:.28,shadowRadius:11,shadowOffset:{width:0,height:4},elevation:5},
 label:{fontSize:10,lineHeight:14,fontWeight:'600'},mapLabel:{backgroundColor:'#FFFFFF',paddingHorizontal:5,borderRadius:6},
});
