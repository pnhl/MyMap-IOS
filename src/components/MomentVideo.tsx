import React,{useEffect} from 'react';
import {StyleSheet,AppState} from 'react-native';
import {useIsFocused} from '@react-navigation/native';
import {useVideoPlayer,VideoView} from 'expo-video';
import {pauseMusicPlayback} from '../services/musicPlayback';
export function MomentVideo({uri}:{uri:string}){
 const focused=useIsFocused();const player=useVideoPlayer(uri,p=>{p.loop=false;p.audioMixingMode='doNotMix';});
 useEffect(()=>{const sub=player.addListener('playingChange',e=>{if(e.isPlaying)void pauseMusicPlayback();});return()=>sub.remove();},[player]);
 useEffect(()=>{if(!focused)player.pause();},[focused,player]);
 useEffect(()=>{const sub=AppState.addEventListener('change',state=>{if(state!=='active')player.pause();});return()=>sub.remove();},[player]);
 return <VideoView player={player} style={s.video} nativeControls contentFit="contain" allowsPictureInPicture={false}/>;
}
const s=StyleSheet.create({video:{width:'100%',height:'100%',backgroundColor:'#02060C'}});
