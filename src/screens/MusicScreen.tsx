import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Alert, Image, Linking, Pressable, ScrollView, StyleSheet, Switch, View} from 'react-native';
import {useFocusEffect} from '@react-navigation/native';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {ScreenScaffold, EmptyGlass, SectionTitle} from '../ui/ScreenScaffold';
import {GlassButton, GlassChip, GlassSurface, type IconName} from '../ui/glass';
import {Text} from '../ui/Text';
import {TextInput} from '../ui/TextInput';
import {useAppTheme} from '../ui/theme';
import {CURATED_RADIO_STATIONS, searchFreeRadioStations} from '../services/freeRadio';
import {useJourneyMusic, selectMusicSource, playJourneyMusic, toggleJourneyMusic, nextJourneyMusic, previousJourneyMusic, radioMusicItem} from '../services/musicControls';
import {enqueueMusicItem, removeQueuedMusicItem, seekMusicPlayback, setMusicVolume, setMusicShuffle, setMusicRepeat, setMusicSleepTimer, setMusicSharing, toggleMusicFavorite, importLocalMusic, deleteLocalMusic} from '../services/musicPlayback';
import type {MusicItem} from '../services/musicLibrary';

type Tab = 'radio' | 'local' | 'favorites';
const tabs: {key:Tab;label:string;icon:IconName}[] = [
  {key:'radio',label:'Radio',icon:'radio'},
  {key:'local',label:'Nhạc trên máy',icon:'folder-music-outline'},
  {key:'favorites',label:'Yêu thích',icon:'heart-outline'},
];
const time = (seconds:number) => `${Math.floor(Math.max(0,seconds)/60)}:${String(Math.floor(Math.max(0,seconds)%60)).padStart(2,'0')}`;

export default function MusicScreen() {
  const {theme} = useAppTheme();
  const music = useJourneyMusic();
  const {local} = music;
  const [tab,setTab] = useState<Tab>('radio');
  const [query,setQuery] = useState('');
  const [radio,setRadio] = useState(() => CURATED_RADIO_STATIONS.map(radioMusicItem));
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<string|null>(null);
  const [showQueue,setShowQueue] = useState(false);
  const seekWidth = useRef(1);
  const searchGeneration = useRef(0);
  const muted = {color:theme.colors.muted};

  useFocusEffect(useCallback(()=>{void selectMusicSource('mymap').catch(()=>{});return()=>{searchGeneration.current++;};},[]));
  const run = async (work:() => void|Promise<unknown>) => {
    setError(null);
    try {await work();} catch(e) {setError(e instanceof Error ? e.message : String(e));}
  };
  const searchRadio = async () => {
    const generation = ++searchGeneration.current;
    setBusy(true); setError(null);
    try {
      const stations = await searchFreeRadioStations(query);
      if(generation===searchGeneration.current)setRadio(stations.map(radioMusicItem));
    } catch(e) {if(generation===searchGeneration.current)setError(e instanceof Error?e.message:String(e));}
    finally {if(generation===searchGeneration.current)setBusy(false);}
  };
  const seek = (seconds:number) => run(() => seekMusicPlayback(seconds));
  const favorite = local.current && local.favorites.some(item => item.id===local.current?.id);
  const shuffle = local.shuffle;
  const repeatLabel = local.repeat==='one'?'Lặp một bài':local.repeat==='all'?'Lặp tất cả':'Không lặp';
  const cycleRepeat = () => run(() => setMusicRepeat(local.repeat==='off'?'all':local.repeat==='all'?'one':'off'));

  const iconButton = (icon:IconName,label:string,onPress:()=>void,disabled=false,active=false) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.iconButton,{backgroundColor:active?`${theme.colors.primary}25`:theme.colors.bgRaised},disabled&&{opacity:.4}]}><MaterialCommunityIcons name={icon} size={24} color={active?theme.colors.primary:theme.colors.text}/></Pressable>;
  const listItem = (item:MusicItem,list:readonly MusicItem[],canDelete=false,queueItem=false) => <GlassSurface key={item.id} style={s.track}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Nghe ${item.title}`} onPress={() => void run(() => playJourneyMusic(item,list))} style={s.trackCopy}>
      <View style={[s.smallArt,{backgroundColor:`${theme.colors.primary}12`}]}>{item.artworkUrl?<Image source={{uri:item.artworkUrl}} style={s.smallArt}/>:<MaterialCommunityIcons name={item.kind==='radio'?'radio':'music-note'} size={23} color={theme.colors.primary}/>}</View>
      <View style={{flex:1,minWidth:0}}><Text style={s.trackTitle} numberOfLines={2}>{item.title}</Text><Text style={[s.caption,muted]} numberOfLines={1}>{item.artist || (item.kind==='local'?'Nhạc trên máy':'Radio')}</Text></View>
    </Pressable>
    {iconButton(local.favorites.some(value=>value.id===item.id)?'heart':'heart-outline','Lưu hoặc bỏ yêu thích',()=>void run(()=>toggleMusicFavorite(item)),false,local.favorites.some(value=>value.id===item.id))}
    {queueItem?iconButton('close','Xóa khỏi hàng đợi',()=>void run(()=>removeQueuedMusicItem(item.id))):canDelete?iconButton('trash-can-outline','Xóa nhạc đã nhập',()=>Alert.alert('Xóa nhạc đã nhập',item.title,[{text:'Hủy',style:'cancel'},{text:'Xóa',style:'destructive',onPress:()=>void run(()=>deleteLocalMusic(item.id))}])):iconButton('playlist-plus','Thêm vào hàng đợi',()=>void run(()=>enqueueMusicItem(item)))}
  </GlassSurface>;

  return <ScreenScaffold title="Âm nhạc" subtitle="Nghe trực tiếp nhạc trên máy và radio trong MyMap" icon="music-note">
    <GlassSurface style={s.player}>
      <View style={s.playerHeading}>
        <View style={[s.art,{backgroundColor:`${theme.colors.primary}14`}]}>{music.artwork?<Image source={{uri:music.artwork}} style={s.art}/>:<MaterialCommunityIcons name={local.current?.kind==='local'?'music-note':'radio'} size={32} color={theme.colors.primary}/>}</View>
        <View style={{flex:1,minWidth:0}}><Text style={[s.caption,{color:theme.colors.primary}]}>{'Trình phát MyMap'}</Text><Text style={s.song} numberOfLines={2}>{music.title}</Text><Text style={[s.caption,muted]} numberOfLines={1}>{music.artist || 'Sẵn sàng đồng hành cùng bạn'}</Text></View>
        {local.current && iconButton(favorite?'heart':'heart-outline','Lưu hoặc bỏ yêu thích',()=>void run(()=>toggleMusicFavorite(local.current!)),false,Boolean(favorite))}
      </View>
      {music.duration>0 && local.current?.kind==='local'?<>
        <Pressable accessibilityRole="adjustable" accessibilityLabel="Tiến độ bài hát" accessibilityValue={{min:0,max:Math.round(music.duration),now:Math.round(music.position)}} onAccessibilityAction={event=>void seek(music.position+(event.nativeEvent.actionName==='increment'?10:-10))} accessibilityActions={[{name:'increment',label:'Tiến 10 giây'},{name:'decrement',label:'Lùi 10 giây'}]} onLayout={event=>{seekWidth.current=Math.max(1,event.nativeEvent.layout.width);}} onPress={event=>void seek(Math.max(0,Math.min(1,event.nativeEvent.locationX/seekWidth.current))*music.duration)} style={s.seekTarget}><View style={[s.progress,{backgroundColor:theme.colors.border}]}><View style={[s.progressFill,{backgroundColor:theme.colors.primary,width:`${Math.min(100,music.position/music.duration*100)}%`}]}/></View></Pressable>
        <View style={s.between}><Text style={[s.caption,muted]}>{time(music.position)}</Text><Text style={[s.caption,muted]}>{time(music.duration)}</Text></View>
      </>:<Text style={[s.caption,muted]}>{music.buffering?'Đang tải âm thanh…':music.playing?'Đang phát trực tiếp':'Đã tạm dừng'}</Text>}
      <View style={s.controls}>
        {iconButton('skip-previous','Bài trước',()=>void run(previousJourneyMusic),!music.canControl || !local.queue.length)}
        <Pressable accessibilityRole="button" accessibilityLabel={music.playing?'Tạm dừng nhạc':'Phát nhạc'} disabled={!music.canControl} onPress={()=>void run(()=>local.current?toggleJourneyMusic():playJourneyMusic(radio[0]!,radio))} style={[s.play,{backgroundColor:theme.colors.primary},!music.canControl&&{opacity:.4}]}>{music.buffering?<ActivityIndicator color={theme.colors.bg}/>:<MaterialCommunityIcons name={music.playing?'pause':'play'} size={34} color={theme.colors.bg}/>}</Pressable>
        {iconButton('skip-next','Bài tiếp theo',()=>void run(nextJourneyMusic),!music.canControl || !local.queue.length)}
      </View>
      <View style={s.options}>
        <GlassChip label={shuffle?'Ngẫu nhiên: Bật':'Ngẫu nhiên'} active={shuffle} onPress={()=>void run(()=>setMusicShuffle(!shuffle))}/>
        <GlassChip label={repeatLabel} active={repeatLabel!=='Không lặp'} onPress={cycleRepeat}/>
        <GlassChip label="Hàng đợi" active={showQueue} onPress={()=>setShowQueue(!showQueue)}/>
      </View>
    </GlassSurface>
    {!!(error || local.error) && <EmptyGlass title="Chưa thể phát nhạc" body={error || local.error || ''} icon="alert-circle-outline"/>}
    {showQueue && <><SectionTitle>Hàng đợi</SectionTitle>{local.queue.length?local.queue.map(item=>listItem(item,local.queue,false,true)):<Text style={muted}>Thêm một bài hát hoặc kênh radio để bắt đầu.</Text>}</>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8}}>{tabs.map(item=><Pressable key={item.key} accessibilityRole="tab" accessibilityState={{selected:tab===item.key}} onPress={()=>setTab(item.key)} style={[s.tab,{backgroundColor:tab===item.key?`${theme.colors.primary}20`:theme.colors.bgRaised,borderColor:tab===item.key?theme.colors.primary:theme.colors.border}]}><MaterialCommunityIcons name={item.icon} size={19} color={tab===item.key?theme.colors.primary:theme.colors.muted}/><Text style={[s.tabText,{color:tab===item.key?theme.colors.text:theme.colors.muted}]}>{item.label}</Text></Pressable>)}</ScrollView>
    {tab==='radio' && <>
      <GlassSurface style={s.section}><Text style={s.sectionTitle}>Khám phá radio</Text><TextInput accessibilityLabel="Tìm kênh radio" value={query} onChangeText={setQuery} placeholder="Tên kênh, quốc gia hoặc thể loại" returnKeyType="search" onSubmitEditing={()=>void searchRadio()} style={[s.input,{color:theme.colors.text,borderColor:theme.colors.border,backgroundColor:theme.colors.bgRaised}]}/><View style={s.options}>{['Việt Nam','Lofi','Jazz','Classical'].map(tag=><GlassChip key={tag} label={tag} onPress={()=>{setQuery(tag);void run(async()=>{const generation=++searchGeneration.current;const results=await searchFreeRadioStations(tag);if(generation===searchGeneration.current)setRadio(results.map(radioMusicItem));});}}/>)}</View><GlassButton disabled={busy} onPress={()=>void searchRadio()}><Text>Tìm kênh radio</Text></GlassButton>{busy&&<ActivityIndicator color={theme.colors.primary}/>}<Text style={[s.caption,muted]}>Radio trực tuyến cần Internet. Một số kênh có thể tạm ngừng phát.</Text></GlassSurface>
      {radio.length?radio.map(item=>listItem(item,radio)):<EmptyGlass title="Chưa tìm thấy kênh" body="Thử một tên kênh hoặc thể loại khác." icon="radio"/>}
    </>}
    {tab==='local' && <>
      <GlassSurface style={s.section}><Text style={s.sectionTitle}>Nhạc trên máy</Text><Text style={[s.body,muted]}>Chọn tệp âm thanh của bạn. MyMap lưu bản sao trong ứng dụng để nghe khi không có Internet.</Text><GlassButton disabled={busy} onPress={()=>{setBusy(true);void run(importLocalMusic).finally(()=>setBusy(false));}}><Text>Thêm tệp âm thanh</Text></GlassButton></GlassSurface>
      {local.localTracks.length?local.localTracks.map(item=>listItem(item,local.localTracks,true)):<EmptyGlass title="Thêm nhạc bạn yêu thích" body="Chọn tệp MP3, M4A, WAV hoặc định dạng âm thanh được hỗ trợ trên thiết bị." icon="folder-music-outline"/>}
    </>}
    {tab==='favorites' && <><SectionTitle>Yêu thích</SectionTitle>{local.favorites.length?local.favorites.map(item=>listItem(item,local.favorites)):<EmptyGlass title="Những giai điệu bạn muốn giữ lại" body="Chạm trái tim cạnh bài hát hoặc kênh radio để lưu vào đây." icon="heart-outline"/>}<SectionTitle>Nghe gần đây</SectionTitle>{local.history.slice(0,12).map(item=>listItem(item,local.history))}</>}
    {<GlassSurface style={s.section}>
      <Text style={s.sectionTitle}>Phát nhạc theo cách của bạn</Text><Text style={[s.caption,muted]}>Âm lượng</Text><View style={s.options}>{[0,.25,.5,.75,1].map(value=><GlassChip key={value} label={`${Math.round(value*100)}%`} active={local.volume===value} onPress={()=>void run(()=>setMusicVolume(value))}/>)}</View>
      <Text style={[s.caption,muted]}>Hẹn giờ tắt nhạc</Text><View style={s.options}>{[null,15,30,60].map(minutes=><GlassChip key={String(minutes)} label={minutes?`${minutes} phút`:'Tắt'} active={minutes===null&&!local.sleepUntil} onPress={()=>void run(()=>setMusicSleepTimer(minutes))}/>)}</View>{local.sleepUntil && <Text style={[s.caption,muted]}>Tắt nhạc lúc {new Date(local.sleepUntil).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</Text>}
    </GlassSurface>}
    <GlassSurface style={[s.section,s.sharing]}><View style={{flex:1}}><Text style={s.trackTitle}>Chia sẻ bài đang nghe</Text><Text style={[s.caption,muted]}>Hiện tên bài hát cho bạn bè khi bạn đang chia sẻ vị trí.</Text></View><Switch accessibilityLabel="Chia sẻ bài đang nghe" value={local.shareNowPlaying} onValueChange={value=>void run(()=>setMusicSharing(value))} trackColor={{true:theme.colors.primary}}/></GlassSurface>
  </ScreenScaffold>;
}

const s=StyleSheet.create({
  player:{padding:18,gap:10},playerHeading:{flexDirection:'row',alignItems:'center',gap:12},art:{width:62,height:62,borderRadius:16,alignItems:'center',justifyContent:'center'},song:{fontSize:18,fontWeight:'800',lineHeight:24,marginVertical:3},caption:{fontSize:12,lineHeight:18},body:{fontSize:13,lineHeight:21},controls:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:26,marginVertical:6},iconButton:{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center'},play:{width:66,height:66,borderRadius:33,alignItems:'center',justifyContent:'center'},options:{flexDirection:'row',flexWrap:'wrap',gap:7},between:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},seekTarget:{height:32,justifyContent:'center'},progress:{height:4,borderRadius:3,overflow:'hidden'},progressFill:{height:4},tab:{flexDirection:'row',gap:7,paddingHorizontal:14,paddingVertical:12,borderRadius:22,borderWidth:1,alignItems:'center'},tabText:{fontSize:13,fontWeight:'700'},section:{padding:17,gap:12},sectionTitle:{fontSize:18,fontWeight:'800'},buttonText:{fontWeight:'700'},input:{borderWidth:1,borderRadius:13,paddingHorizontal:13,paddingVertical:12,fontSize:15},connectionLink:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingVertical:9},track:{padding:10,flexDirection:'row',alignItems:'center',gap:4},trackCopy:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:10},smallArt:{width:42,height:42,borderRadius:10,alignItems:'center',justifyContent:'center'},trackTitle:{fontSize:14,fontWeight:'700',lineHeight:20},sharing:{flexDirection:'row',alignItems:'center',gap:10},
});
