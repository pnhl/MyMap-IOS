import React from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {useNavigation} from '@react-navigation/native';
import {Text} from '../ui/Text';
import {useAppTheme} from '../ui/theme';
import {useJourneyMusic, toggleJourneyMusic, playDefaultJourneyRadio} from '../services/musicControls';

export function MusicStatusWidget() {
  const nav = useNavigation<any>();
  const {theme} = useAppTheme();
  const music = useJourneyMusic();
  const toggle = async () => {
    try {
      if (!music.canControl) {nav.navigate('Music'); return;}
      if (music.source === 'mymap' && !music.local.current) await playDefaultJourneyRadio();
      else await toggleJourneyMusic();
    } catch (error) {Alert.alert('Âm nhạc', error instanceof Error ? error.message : String(error));}
  };
  return <View style={s.row}>
    <Pressable accessibilityRole="button" accessibilityLabel="Mở trình phát nhạc" onPress={() => nav.navigate('Music')} style={s.copy}>
      <MaterialCommunityIcons name="music-note" size={22} color={theme.colors.primary}/>
      <View style={{flex:1}}><Text numberOfLines={1} style={s.title}>{music.title}</Text><Text numberOfLines={1} style={{color:theme.colors.muted,fontSize:11}}>{music.source === 'spotube' ? 'Spotube' : music.local.current?.kind === 'local' ? 'Nhạc trên máy' : 'Radio'}</Text></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={music.playing ? 'Tạm dừng nhạc' : 'Phát nhạc'} onPress={() => void toggle()} style={[s.button,{backgroundColor:`${theme.colors.primary}18`}]}><MaterialCommunityIcons name={music.playing ? 'pause' : 'play'} size={23} color={theme.colors.primary}/></Pressable>
  </View>;
}
const s=StyleSheet.create({row:{flex:1,flexDirection:'row',alignItems:'center',gap:8},copy:{flex:1,flexDirection:'row',alignItems:'center',gap:8,minWidth:0},title:{fontSize:12,fontWeight:'700'},button:{width:44,height:44,borderRadius:22,alignItems:'center',justifyContent:'center'}});
