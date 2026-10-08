import {TextInput} from '../ui/TextInput';
import React,{useCallback,useMemo,useRef,useState}from'react';
import{ActivityIndicator,Image,Modal,Pressable,StyleSheet,View}from'react-native';
import{useFocusEffect,useNavigation,useRoute}from'@react-navigation/native';
import{MaterialCommunityIcons}from'@expo/vector-icons';
import * as Location from 'expo-location';
import{Share}from'react-native';
import{getPhotoPins,getLocationPoints}from'../db/database';

import{getSavedPlaces,savePlace,placeKey}from'../services/placeMetadata';
import{distanceMeters,deriveVisits,formatDuration}from'../utils/geo';
import{groupPointsByLocalDay}from'../utils/journeyStats';
import{openExternalNavigation}from'../maps';
import{NATIVE_MAPS_ENABLED}from'../config/maps';
import{GlassButton,GlassSurface,IconBadge,TopIconButton,ScreenQuote,glassColors,useResponsiveLayout}from'../ui/glass';
import{WorldMap}from'../ui/WorldMap';
import{ScreenScaffold,EmptyGlass}from'../ui/ScreenScaffold';
import{Text}from'../ui/Text';
import type{PhotoPin}from'../types/photo';import type{Visit}from'../types/location';
import{getOpenStreetMapDetails,type OsmObjectDetails,type OsmType}from'../services/openStreetMap';
import{getSmartPlaces,setPlaceSmartTag,getFriendsWhoVisitedPlace,detectSmartPlacesFromVisits,type SmartPlaceType,type SmartPlaceMeta,type PlaceFriendVisitor}from'../services/smartPlaces';
import{getLiveFriends}from'../services/realtimeFriends';
import{NativeAdCard}from'../components/NativeAdCard';
import{LandmarkCard}from'../components/LandmarkCard';

export default function PlaceDetailScreen(){
 const route=useRoute<any>();const nav=useNavigation<any>();const r=useResponsiveLayout();const params=route.params||{};
 const lat=Number(params.latitude),lon=Number(params.longitude);const valid=params.latitude!=null&&params.longitude!=null&&Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
 const[name,setName]=useState(params.name||'Địa điểm'),[address,setAddress]=useState(valid?`${lat.toFixed(5)}, ${lon.toFixed(5)}`:'Chưa có tọa độ'),[photos,setPhotos]=useState<PhotoPin[]>([]),[index,setIndex]=useState(0),[favorite,setFavorite]=useState(false),[note,setNote]=useState(''),[draft,setDraft]=useState(''),[editing,setEditing]=useState(false),[visit,setVisit]=useState<Visit|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[viewer,setViewer]=useState(false),[more,setMore]=useState(false),[mapLoaded,setMapLoaded]=useState(false);
 const[osmDetails,setOsmDetails]=useState<OsmObjectDetails|null>(null),[osmLoading,setOsmLoading]=useState(false),[osmError,setOsmError]=useState<string|null>(null);
 const[directionsModal,setDirectionsModal]=useState(false);
 const[directionTravelMode,setDirectionTravelMode]=useState<'motorbike'|'car'>('motorbike');
 const[smartTag,setSmartTag]=useState<SmartPlaceType|null>(null);
 const[smartMeta,setSmartMeta]=useState<SmartPlaceMeta|null>(null);
 const[friendVisitors,setFriendVisitors]=useState<PlaceFriendVisitor[]>([]);
 const[tagPickerOpen,setTagPickerOpen]=useState(false);
 const pending=useRef(false);
 useFocusEffect(useCallback(()=>{
  let active=true;
  void Promise.all([getPhotoPins(),getLocationPoints(),getSavedPlaces(),getSmartPlaces(),getLiveFriends()]).then(([all,points,saved,smartList,liveFriends])=>{
   if(!active)return;const nearby=valid?all.filter(p=>distanceMeters(p,{latitude:lat,longitude:lon})<=250).sort((a,b)=>b.capturedAt-a.capturedAt):[];setPhotos(nearby);setIndex(0);
   const metadata=valid?saved.find(p=>p.key===placeKey(lat,lon)):undefined;setFavorite(metadata?.favorite||false);setNote(metadata?metadata.note:nearby[0]?.note||'');
   const visits=[...groupPointsByLocalDay(points).values()].flatMap(p=>deriveVisits(p)).filter(v=>valid&&distanceMeters(v,{latitude:lat,longitude:lon})<=150).sort((a,b)=>b.arrivedAt-a.arrivedAt);setVisit(visits[0]||null);

   // Check Smart Place tag
   const foundSmart=valid?smartList.find(sp=>distanceMeters(sp,{latitude:lat,longitude:lon})<=150):undefined;
   if(foundSmart){
    setSmartTag(foundSmart.type);
    setSmartMeta(foundSmart);
   }else if(visits.length>0){
    const detected=detectSmartPlacesFromVisits(visits);
    const match=detected.find(d=>distanceMeters(d,{latitude:lat,longitude:lon})<=150);
    if(match){
     setSmartTag(match.type);
     setSmartMeta(match);
    }
   }

   // Check friends who visited
   if(valid){
    const visitors=getFriendsWhoVisitedPlace(lat,lon,liveFriends);
    setFriendVisitors(visitors);
   }
  }).catch(()=>{if(active)setError('Không thể đọc thông tin địa điểm.');}).finally(()=>{if(active)setLoading(false);});
  if(valid)void Location.getForegroundPermissionsAsync().then(permission=>permission.granted?Location.reverseGeocodeAsync({latitude:lat,longitude:lon}):[]).then(items=>{const a=items[0];if(!active||!a)return;if(!params.name)setName(a.name||a.street||'Địa điểm');setAddress([...new Set([a.name,a.street,a.district,a.city,a.region,a.country].filter(Boolean))].join(', ')||`${lat.toFixed(5)}, ${lon.toFixed(5)}`);}).catch(()=>{});
  return()=>{active=false;};
 },[lat,lon,params.name,valid]));
 useFocusEffect(useCallback(()=>{
  const osmType=params.osmType as OsmType|undefined,osmId=Number(params.osmId);let active=true;
  if(!osmType||!Number.isInteger(osmId)||osmId<=0){setOsmDetails(null);setOsmError(null);return()=>{active=false;};}
  setOsmLoading(true);setOsmError(null);
  void getOpenStreetMapDetails(osmType,osmId).then(value=>{if(active)setOsmDetails(value);}).catch(()=>{if(active)setOsmError('Chưa thể tải thuộc tính chi tiết từ OpenStreetMap.');}).finally(()=>{if(active)setOsmLoading(false);});
  return()=>{active=false;};
 },[params.osmType,params.osmId]));
 const hero=photos[index]||photos[0];
 async function action(work:()=>Promise<void>){if(pending.current)return;pending.current=true;setBusy(true);setError(null);try{await work();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{pending.current=false;setBusy(false);}}
 function toggleFavorite(){if(!valid)return;void action(async()=>{await savePlace({key:placeKey(lat,lon),name,latitude:lat,longitude:lon,note,favorite:!favorite});setFavorite(v=>!v);});}
 async function handleSetSmartTag(type:SmartPlaceType){
  if(!valid)return;
  setTagPickerOpen(false);
  await action(async()=>{
   await setPlaceSmartTag(placeKey(lat,lon),type,name,{latitude:lat,longitude:lon});
   setSmartTag(type);
  });
 }
 async function takePhoto(){nav.navigate('MomentCamera',{purpose:'memory'});}
 async function saveNote(){if(!valid)return;await action(async()=>{const text=draft.trim();await savePlace({key:placeKey(lat,lon),name,latitude:lat,longitude:lon,note:text,favorite});setNote(text);setEditing(false);});}
 const time=(n:number|null|undefined)=>n?new Date(n).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):'—';
 const date=(n:number|null|undefined)=>n?new Date(n).toLocaleDateString('vi-VN'):'Chưa ghi nhận';
 return <ScreenScaffold title="Địa điểm" header={false} hideTitle>
  <View style={[s.hero,{marginHorizontal:-r.gutter,height:r.isWide?390:300}]}>
   {hero?<Image source={{uri:hero.uri}} style={StyleSheet.absoluteFill}/>:<WorldMap observations={valid?[{id:'place',latitude:lat,longitude:lon,label:name}]:[]} height={r.isWide?390:300}/>}
   <View style={s.heroShade}/><View style={s.heroHeader}><TopIconButton icon="chevron-left" accessibilityLabel="Quay lại" onPress={()=>nav.goBack()}/><View style={s.flex}/><TopIconButton icon={favorite?'heart':'heart-outline'} accessibilityLabel={favorite?'Bỏ yêu thích':'Lưu địa điểm yêu thích'} disabled={busy||!valid} onPress={toggleFavorite}/><TopIconButton icon="camera-outline" accessibilityLabel="Chụp thêm kỷ niệm" disabled={busy} onPress={()=>void takePhoto()}/><TopIconButton icon="dots-horizontal" accessibilityLabel="Thông tin thêm" onPress={()=>setMore(true)}/></View>
   <ScreenQuote text="Những nơi đẹp luôn nằm trong những câu chuyện đáng nhớ…" style={s.heroQuote}/>
   <View style={s.heroFooter}><GlassSurface style={s.counter}><MaterialCommunityIcons name="image-outline" size={18} color="#fff"/><Text style={s.white}>{hero?`${index+1} / ${photos.length}`:'Chưa có ảnh'}</Text></GlassSurface>{hero&&<GlassButton tone="neutral" onPress={()=>setViewer(true)}><Text style={s.white}>Xem ảnh</Text></GlassButton>}</View>
  </View>
  <GlassSurface style={s.placeCard}><View style={s.placeInfo}>{hero?<Image source={{uri:hero.uri}} style={s.thumb}/>:<IconBadge name="map-marker" size={30}/>}<View style={s.flex}><Text style={s.placeName}>{name}</Text><Text style={s.category}>Địa điểm trong hành trình</Text><View style={s.addressRow}><MaterialCommunityIcons name="map-marker" size={20} color="#7BBBFF"/><Text style={s.address}>{address}</Text></View></View></View>
   {valid&&<View style={s.positionBadge}><MaterialCommunityIcons name="crosshairs-gps" size={18} color={glassColors.green}/><Text style={s.positionText}>Tọa độ đã lưu · {lat.toFixed(4)}, {lon.toFixed(4)}</Text></View>}
   <View style={s.smartTagRow}>
    <Pressable
     accessibilityRole="button"
     accessibilityLabel="Gắn nhãn thông minh cho địa điểm"
     onPress={()=>setTagPickerOpen(true)}
     style={[
      s.smartBadge,
      smartTag==='home'&&{borderColor:'#71F1FF',backgroundColor:'rgba(34,211,238,0.18)'},
      smartTag==='work'&&{borderColor:'#A78BFA',backgroundColor:'rgba(167,139,250,0.18)'},
      smartTag==='want_to_go'&&{borderColor:'#FBBF24',backgroundColor:'rgba(251,191,36,0.18)'},
     ]}
    >
     <MaterialCommunityIcons
      name={
       smartTag==='home'?'home-variant':
       smartTag==='work'?'briefcase':
       smartTag==='school'?'school':
       smartTag==='want_to_go'?'star':
       smartTag==='frequent'?'heart-pulse':'tag-plus-outline'
      }
      size={15}
      color="#71F1FF"
     />
     <Text style={s.smartTagText}>
      {smartTag==='home'?'Nhà riêng 🏠':
       smartTag==='work'?'Nơi làm việc 💼':
       smartTag==='school'?'Trường học 🎓':
       smartTag==='want_to_go'?'Muốn đi ⭐':
       smartTag==='frequent'?'Quen thuộc ✨':'Gắn nhãn Smart Place +'}
     </Text>
    </Pressable>
    {smartMeta&&(
     <Text style={s.smartVisitsText}>
      Đã ghé {smartMeta.visitCount} lần {smartMeta.isAutoDetected?'· Tự phát hiện':''}
     </Text>
    )}
   </View>
  </GlassSurface>
  {(osmLoading||osmDetails||osmError)&&<GlassSurface style={s.osmCard}><View style={s.notesHeader}><IconBadge name="map-search-outline" size={22}/><Text style={s.section}>Dữ liệu OpenStreetMap</Text>{osmLoading&&<ActivityIndicator color={glassColors.cyan}/>}</View>{osmError&&<Text style={s.osmError}>{osmError}</Text>}{osmDetails&&Object.entries(osmDetails.tags).filter(([key])=>['name','name:vi','amenity','tourism','historic','shop','opening_hours','website','phone','wheelchair','operator'].includes(key)).slice(0,10).map(([key,value])=><View key={key} style={s.osmRow}><Text style={s.osmKey}>{key}</Text><Text selectable style={s.osmValue}>{value.slice(0,300)}</Text></View>)}{osmDetails&&!Object.keys(osmDetails.tags).length&&<Text style={s.note}>Đối tượng này chưa có thuộc tính mô tả.</Text>}<Text style={s.osmAttribution}>© OpenStreetMap contributors · Overpass API</Text></GlassSurface>}
  <LandmarkCard id={osmDetails?.tags.wikidata}/>
  {loading&&<ActivityIndicator color={glassColors.cyan}/>} {error&&<EmptyGlass icon="alert-circle-outline" title="Chưa thể hoàn tất" body={error}/>}
  {photos.length>1&&<View style={s.photoStrip}>{photos.map((p,i)=><Pressable accessibilityRole="button" accessibilityLabel={`Xem ảnh ${i+1}`} accessibilityState={{selected:i===index}} key={p.id} onPress={()=>setIndex(i)}><Image source={{uri:p.uri}} style={[s.stripThumb,i===index&&{borderColor:'#71F1FF',borderWidth:2}]}/></Pressable>)}</View>}
  <View style={s.stats}>{[
   {icon:'clock-outline' as const,label:'Giờ đến',value:time(visit?.arrivedAt),sub:date(visit?.arrivedAt)},
   {icon:'flag-outline' as const,label:'Giờ rời đi',value:time(visit?.leftAt),sub:visit&&!visit.leftAt?'Đang ở đây':date(visit?.leftAt)},
   {icon:'timer-sand' as const,label:'Thời gian ở lại',value:visit?formatDuration(visit.durationMs):'—',sub:'Từ điểm dừng GPS'},
   {icon:'camera-outline' as const,label:'Kỷ niệm tại đây',value:photos.length,sub:'Ảnh trong 250 m'},
  ].map((m,i)=><GlassSurface key={m.label} style={[s.stat,{width:r.width<360||r.fontScale>1.2?'48%':'23.2%'}]}><IconBadge name={m.icon} tone={i%2?'violet':'cyan'} size={22}/><Text style={s.statLabel}>{m.label}</Text><Text style={s.statValue}>{m.value}</Text><Text style={s.statSub}>{m.sub}</Text></GlassSurface>)}</View>

  <GlassSurface style={s.friendsCard}>
   <View style={s.notesHeader}>
    <IconBadge name="account-group" size={22} tone="cyan"/>
    <Text style={s.section}>Bạn bè ghi nhận gần đây ({friendVisitors.length})</Text>
   </View>
   {friendVisitors.length===0?(
    <Text style={s.note}>Chưa có vị trí hoặc điểm dừng được chia sẻ gần địa điểm này.</Text>
   ):(
    <View style={s.visitorList}>
     {friendVisitors.slice(0,5).map((v,i)=>(
      <View key={v.friendId} style={s.visitorItem}>
       <View style={s.visitorAvatar}>
        {v.avatarUrl?(
         <Image source={{uri:v.avatarUrl}} style={s.avatarImg}/>
        ):(
         <Text style={s.avatarInitial}>{v.friendName.charAt(0).toUpperCase()}</Text>
        )}
       </View>
       <View style={s.flex}>
        <View style={s.visitorTitleRow}>
         <Text style={s.visitorName}>{v.friendName}</Text>

        </View>
        <Text style={s.visitorSub}>
         {v.visitCount==null?'Vị trí gần đây':`${v.visitCount} điểm dừng đã ghi nhận`} · {new Date(v.lastVisitedMs).toLocaleDateString('vi-VN')}
        </Text>
       </View>
      </View>
     ))}
    </View>
   )}
  </GlassSurface>

  <NativeAdCard placement="place" />

  <GlassSurface style={s.notes}><View style={s.notesHeader}><IconBadge name="file-document-edit-outline" size={23}/><Text style={s.section}>Ghi chú cá nhân</Text><Pressable accessibilityRole="button" accessibilityLabel="Chỉnh sửa ghi chú địa điểm" disabled={!valid||busy} onPress={()=>{setDraft(note);setEditing(true);}} style={s.edit}><MaterialCommunityIcons name="pencil-outline" size={18} color="#C9E7FF"/><Text style={s.white}>Sửa</Text></Pressable></View><Text style={s.note}>{note||'Lưu cảm xúc, người đồng hành hoặc một điều đáng nhớ ở đây.'}</Text></GlassSurface>
  {valid&&<GlassSurface style={s.mapCard}><View style={s.notesHeader}><MaterialCommunityIcons name="map-marker" size={25} color={glassColors.cyan}/><Text style={s.section}>Vị trí trên bản đồ</Text><Pressable accessibilityRole="button" accessibilityLabel="Chỉ đường" onPress={()=>setDirectionsModal(true)} style={s.edit}><MaterialCommunityIcons name="navigation-variant" size={22} color="#C8E9FF"/></Pressable></View><View style={s.miniMap}><WorldMap observations={[{id:'place',latitude:lat,longitude:lon,label:name}]} height={185}/></View></GlassSurface>}
  <View style={s.bottomActions}>
   <GlassButton style={s.flex} tone="neutral" disabled={!valid||busy} onPress={toggleFavorite}><Text style={s.white}>{favorite?'Đã lưu':'Lưu'}</Text></GlassButton>
   <GlassButton style={[s.flex,{flex:1.3}]} disabled={!valid||busy} onPress={()=>setDirectionsModal(true)}>
    <View style={s.actionRow}><MaterialCommunityIcons name="navigation-variant" size={21} color="#D4F8FF"/><Text style={s.white}>Chỉ đường</Text></View>
   </GlassButton>
   <GlassButton style={s.flex} tone="purple" disabled={!valid||busy} onPress={()=>void Share.share({title:name,message:`${name}\n${address}\nhttps://maps.google.com/?q=${lat},${lon}`})}><Text style={s.white}>Chia sẻ</Text></GlassButton>
  </View>

  <Modal visible={directionsModal} transparent animationType="fade" onRequestClose={()=>setDirectionsModal(false)}>
   <View style={s.overlay}>
    <GlassSurface style={s.dialog}>
     <View style={s.notesHeader}>
      <IconBadge name="navigation-variant" size={24} tone="cyan" />
      <View style={s.flex}>
       <Text style={s.placeName} numberOfLines={1}>Chỉ đường</Text>
       <Text style={s.address} numberOfLines={1}>{name}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={()=>setDirectionsModal(false)} style={s.close}>
       <MaterialCommunityIcons name="close" size={24} color="#DCEEFF"/>
      </Pressable>
      </View>

      <View style={s.dirModeRow}>
       {([
        {id:'motorbike' as const,label:'Xe máy',icon:'motorbike' as const},
        {id:'car' as const,label:'Ô tô',icon:'car' as const},
       ]).map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityState={{selected:directionTravelMode===item.id}} onPress={()=>setDirectionTravelMode(item.id)} style={[s.dirMode,directionTravelMode===item.id&&s.dirModeActive]}>
        <MaterialCommunityIcons name={item.icon} size={19} color={directionTravelMode===item.id?'#71F1FF':'#9BBAD8'}/>
        <Text style={[s.dirModeText,directionTravelMode===item.id&&s.dirModeTextActive]}>{item.label}</Text>
       </Pressable>)}
      </View>

      <Pressable
      accessibilityRole="button"
      accessibilityLabel="Xem trực tiếp trong MyMap"
      onPress={()=>{
       setDirectionsModal(false);
        nav.navigate('Tabs', { screen: 'Map', params: { destination: { latitude: lat, longitude: lon, name }, travelMode: directionTravelMode } });
      }}
      style={s.dirOption}
     >
      <IconBadge name="map-marker-path" size={24} tone="cyan" />
      <View style={s.flex}>
       <Text style={s.dirOptionTitle}>Chỉ đường trong MyMap</Text>
       <Text style={s.dirOptionSub}>Xem tuyến đường, khoảng cách và thời gian trực tiếp trong ứng dụng</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color="#71F1FF"/>
     </Pressable>

     <Pressable
      accessibilityRole="button"
      accessibilityLabel="Mở ứng dụng Google Maps"
      onPress={()=>{
       setDirectionsModal(false);
       void openExternalNavigation(lat, lon, name);
      }}
      style={s.dirOption}
     >
      <IconBadge name="compass-outline" size={24} tone="blue" />
      <View style={s.flex}>
       <Text style={s.dirOptionTitle}>Mở Google Maps / Ứng dụng ngoài</Text>
       <Text style={s.dirOptionSub}>Dẫn đường theo thời gian thực (turn-by-turn) bằng giọng nói</Text>
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color="#C4DCFF"/>
     </Pressable>

     <GlassButton tone="neutral" onPress={()=>setDirectionsModal(false)}>
      <Text style={s.white}>Hủy</Text>
     </GlassButton>
    </GlassSurface>
   </View>
  </Modal>

  <Modal visible={tagPickerOpen} transparent animationType="fade" onRequestClose={()=>setTagPickerOpen(false)}>
   <View style={s.overlay}>
    <GlassSurface style={s.dialog}>
     <View style={s.notesHeader}>
      <IconBadge name="tag-outline" size={24} tone="cyan"/>
      <View style={s.flex}>
       <Text style={s.placeName} numberOfLines={1}>Gắn nhãn thông minh</Text>
       <Text style={s.address} numberOfLines={1}>{name}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Đóng" onPress={()=>setTagPickerOpen(false)} style={s.closeBtn}>
       <MaterialCommunityIcons name="close" size={24} color="#DCEEFF"/>
      </Pressable>
     </View>

     <View style={s.tagList}>
      {[
       {type:'home' as SmartPlaceType,icon:'home-variant',label:'Nhà riêng 🏠',desc:'Tự nhận diện khi ở qua đêm >= 3 lần'},
       {type:'work' as SmartPlaceType,icon:'briefcase',label:'Nơi làm việc 💼',desc:'Địa điểm giờ hành chính các ngày trong tuần'},
       {type:'school' as SmartPlaceType,icon:'school',label:'Trường học 🎓',desc:'Trường đại học, lớp học của bạn'},
       {type:'want_to_go' as SmartPlaceType,icon:'star',label:'Muốn đi ⭐',desc:'Lưu vào danh sách ước muốn (Wishlist)'},
       {type:'frequent' as SmartPlaceType,icon:'heart-pulse',label:'Quen thuộc ✨',desc:'Quán ruột, điểm tụ tập hay ghé'},
      ].map(opt=>(
       <Pressable
        key={opt.type}
        accessibilityRole="button"
        accessibilityLabel={opt.label}
        onPress={()=>void handleSetSmartTag(opt.type)}
        style={[s.tagOption,smartTag===opt.type&&s.tagOptionSelected]}
       >
        <IconBadge name={opt.icon as any} size={22} tone={smartTag===opt.type?'cyan':'blue'}/>
        <View style={s.flex}>
         <Text style={s.tagOptionTitle}>{opt.label}</Text>
         <Text style={s.tagOptionDesc}>{opt.desc}</Text>
        </View>
        {smartTag===opt.type&&<MaterialCommunityIcons name="check" size={20} color="#71F1FF"/>}
       </Pressable>
      ))}
     </View>

     <GlassButton tone="neutral" onPress={()=>setTagPickerOpen(false)}>
      <Text style={s.white}>Hủy</Text>
     </GlassButton>
    </GlassSurface>
   </View>
  </Modal>

  <Modal visible={editing} transparent animationType="fade" onRequestClose={()=>{if(!busy)setEditing(false);}}><View style={s.overlay}><GlassSurface style={s.dialog}><Text style={s.placeName}>Ghi chú cho {name}</Text><TextInput accessibilityLabel="Ghi chú địa điểm" style={s.input} multiline value={draft} onChangeText={setDraft} editable={!busy} maxLength={4000} placeholder="Nhập điều bạn muốn ghi nhớ…" placeholderTextColor={glassColors.faint}/><View style={s.bottomActions}><GlassButton style={s.flex} tone="neutral" disabled={busy} onPress={()=>setEditing(false)}><Text style={s.white}>Hủy</Text></GlassButton><GlassButton style={s.flex} disabled={busy||!valid} onPress={()=>void saveNote()}><Text style={s.white}>{busy?'Đang lưu…':'Lưu ghi chú'}</Text></GlassButton></View></GlassSurface></View></Modal>
  <Modal visible={viewer} animationType="fade" onRequestClose={()=>setViewer(false)}><View style={s.fullscreen}>{hero&&<Image source={{uri:hero.uri}} resizeMode="contain" style={StyleSheet.absoluteFill}/>}<View style={s.close}><TopIconButton icon="close" accessibilityLabel="Đóng ảnh" onPress={()=>setViewer(false)}/></View></View></Modal>
  <Modal visible={more} transparent animationType="fade" onRequestClose={()=>setMore(false)}><View style={s.overlay}><GlassSurface style={s.dialog}><Text style={s.placeName}>Thông tin địa điểm</Text><Text style={s.note}>Ảnh được lấy từ kỷ niệm đã lưu trong bán kính 250 m. Giờ đến, giờ rời và thời gian ở lại chỉ hiển thị khi có điểm dừng GPS gần địa điểm. Tọa độ GPS không xác minh tên hoặc phân loại địa điểm.</Text><GlassButton onPress={()=>setMore(false)}><Text style={s.white}>Đóng</Text></GlassButton></GlassSurface></View></Modal>
 </ScreenScaffold>;
}
const s=StyleSheet.create({
 hero:{position:'relative',overflow:'hidden'},
 heroShade:{...StyleSheet.absoluteFill,backgroundColor:'rgba(2,13,39,.24)'},
 heroHeader:{position:'absolute',top:8,left:12,right:12,flexDirection:'row',alignItems:'center',gap:8},
 flex:{flex:1},
 heroQuote:{position:'absolute',right:17,top:81,width:170},
 heroFooter:{position:'absolute',left:15,right:15,bottom:34,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},
 counter:{paddingHorizontal:12,paddingVertical:8,flexDirection:'row',alignItems:'center',gap:7},
 white:{fontSize:12,fontWeight:'700',color:'#fff'},
 placeCard:{padding:16,marginTop:-34,gap:15},
 placeInfo:{flexDirection:'row',alignItems:'center',gap:13},
 thumb:{width:84,height:98,borderRadius:19,borderWidth:1.5,borderColor:'#85E7FF'},
 placeName:{color:'#fff',fontSize:22,fontWeight:'800',lineHeight:29},
 category:{color:'#ABD3FF',fontSize:12,marginTop:5},
 addressRow:{flexDirection:'row',gap:7,marginTop:7},
 address:{flex:1,fontSize:12,lineHeight:18,color:'#C4DCFF'},
 positionBadge:{paddingHorizontal:11,paddingVertical:8,borderRadius:16,borderWidth:1,borderColor:'rgba(66,233,190,.45)',backgroundColor:'rgba(21,127,124,.27)',flexDirection:'row',alignItems:'center',gap:7},
 positionText:{color:'#89F1D5',fontSize:11,flex:1},
 osmCard:{padding:15,gap:8},
 osmRow:{flexDirection:'row',gap:10,paddingVertical:6,borderTopWidth:1,borderTopColor:'rgba(129,187,243,.2)'},
 osmKey:{width:92,color:glassColors.cyan,fontSize:10.5},
 osmValue:{flex:1,color:'#D6E8FF',fontSize:11.5,lineHeight:17},
 osmError:{color:'#FFB4C8',fontSize:11.5,lineHeight:17},
 osmAttribution:{color:'#88B9DE',fontSize:9,textAlign:'right'},
 photoStrip:{flexDirection:'row',flexWrap:'wrap',gap:7},
 stripThumb:{width:50,height:50,borderRadius:12,borderWidth:1,borderColor:'#86B4E8'},
 stats:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8},
 stat:{padding:9,alignItems:'center',gap:5,minHeight:112,borderRadius:18},
 statLabel:{color:glassColors.muted,fontSize:10,textAlign:'center'},
 statValue:{color:'#fff',fontSize:14,fontWeight:'800',textAlign:'center'},
 statSub:{color:'#B9D1F5',fontSize:9,textAlign:'center'},
 notes:{padding:15,gap:11},
 notesHeader:{flexDirection:'row',alignItems:'center',gap:9},
 section:{flex:1,color:'#fff',fontSize:15,fontWeight:'800'},
 edit:{minHeight:44,minWidth:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
 note:{color:'#C3DAF8',fontSize:13,lineHeight:21},
 mapCard:{paddingTop:12,gap:8},
 miniMap:{height:185,width:'100%',position:'relative',overflow:'hidden'},
 nativeMiniMap:{zIndex:1},
 mapHidden:{opacity:0},
 bottomActions:{flexDirection:'row',gap:9},
 actionRow:{flexDirection:'row',alignItems:'center',gap:6},
 overlay:{flex:1,padding:22,justifyContent:'center',backgroundColor:'rgba(2,9,29,.86)'},
 dialog:{width:'100%',maxWidth:580,alignSelf:'center',padding:19,gap:15},
 input:{minHeight:125,padding:13,borderWidth:1,borderColor:glassColors.border,borderRadius:15,color:'#fff',backgroundColor:'rgba(4,20,49,.65)',textAlignVertical:'top'},
 fullscreen:{flex:1,backgroundColor:'#020B20'},
 close:{position:'absolute',top:50,right:20},
 dirOption:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:18,backgroundColor:'rgba(12,43,94,.55)',borderWidth:1,borderColor:'rgba(124,198,255,.3)'},
 dirModeRow:{flexDirection:'row',gap:8},
 dirMode:{flex:1,minHeight:42,borderRadius:13,borderWidth:1,borderColor:'rgba(148,186,216,.25)',backgroundColor:'rgba(8,31,65,.5)',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7},
 dirModeActive:{borderColor:'#71F1FF',backgroundColor:'rgba(29,155,199,.18)'},
 dirModeText:{color:'#9BBAD8',fontSize:12,fontWeight:'700'},
 dirModeTextActive:{color:'#E9FBFF'},
 dirOptionTitle:{color:'#fff',fontSize:14,fontWeight:'800'},
 dirOptionSub:{color:'#B0D5FF',fontSize:11.5,lineHeight:16,marginTop:2},
 smartTagRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8,paddingTop:4},
 smartBadge:{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:11,paddingVertical:6,borderRadius:14,borderWidth:1,borderColor:'rgba(113,241,255,.4)',backgroundColor:'rgba(21,55,108,.35)'},
 smartTagText:{color:'#BCE8FF',fontSize:11.5,fontWeight:'700'},
 smartVisitsText:{color:'#7EB8F0',fontSize:11},
 friendsCard:{padding:15,gap:12},
 visitorList:{gap:10},
 visitorItem:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:6,borderBottomWidth:1,borderBottomColor:'rgba(255,255,255,0.06)'},
 visitorAvatar:{width:38,height:38,borderRadius:19,backgroundColor:'rgba(34,211,238,0.2)',borderWidth:1.5,borderColor:'#71F1FF',justifyContent:'center',alignItems:'center',overflow:'hidden'},
 avatarImg:{width:'100%',height:'100%'},
 avatarInitial:{color:'#fff',fontSize:15,fontWeight:'800'},
 visitorTitleRow:{flexDirection:'row',alignItems:'center',gap:8},
 visitorName:{color:'#fff',fontSize:13,fontWeight:'700'},
 regularBadge:{backgroundColor:'rgba(251,191,36,0.2)',borderWidth:1,borderColor:'rgba(251,191,36,0.5)',paddingHorizontal:6,paddingVertical:2,borderRadius:8},
 regularText:{color:'#FDE68A',fontSize:9.5,fontWeight:'800'},
 visitorSub:{color:'#96BCE4',fontSize:11,marginTop:2},
 closeBtn:{padding:4},
 tagList:{gap:8},
 tagOption:{flexDirection:'row',alignItems:'center',gap:12,padding:12,borderRadius:16,backgroundColor:'rgba(12,43,94,.45)',borderWidth:1,borderColor:'rgba(124,198,255,.2)'},
 tagOptionSelected:{backgroundColor:'rgba(14,75,140,.6)',borderColor:'#71F1FF'},
 tagOptionTitle:{color:'#fff',fontSize:13.5,fontWeight:'700'},
 tagOptionDesc:{color:'#96BCE4',fontSize:11,marginTop:2},
});
