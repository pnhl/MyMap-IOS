import {TextInput} from '../ui/TextInput';
import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Image,Linking,Pressable,ScrollView,StyleSheet,View,useWindowDimensions} from 'react-native';
import {CameraView,useCameraPermissions,useMicrophonePermissions} from 'expo-camera';
import {MaterialCommunityIcons} from '@expo/vector-icons';
import {useIsFocused,useNavigation,useRoute} from '@react-navigation/native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {getDeviceCurrentPosition} from '../services/platformLocation';
import {saveMoment} from '../services/moments';
import {savePhotoPinFromUri} from '../services/photoPins';
import {pauseMusicPlayback} from '../services/musicPlayback';
import {Text} from '../ui/Text';
import {MomentVideo} from '../components/MomentVideo';
type Shot={uri:string;kind:'photo'|'video';durationSeconds:number};
export default function MomentCameraScreen(){
 const nav=useNavigation<any>(),route=useRoute<any>(),focused=useIsFocused(),insets=useSafeAreaInsets(),size=useWindowDimensions(),landscape=size.width>size.height;
 const camera=useRef<CameraView>(null),mounted=useRef(true),recordingRef=useRef(false),interrupted=useRef(false),busyRef=useRef(false),start=useRef(0),timerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [permission,askCamera]=useCameraPermissions(),[microphone,askMicrophone]=useMicrophonePermissions();
 const [mode,setMode]=useState<'picture'|'video'>('picture'),[facing,setFacing]=useState<'front'|'back'>('back'),[flash,setFlash]=useState(false),[zoom,setZoom]=useState(0),[ready,setReady]=useState(false),[recording,setRecording]=useState(false),[busy,setBusy]=useState(false),[seconds,setSeconds]=useState(0),[timer,setTimer]=useState(false),[countdown,setCountdown]=useState(0),[muted,setMuted]=useState(true),[active,setActive]=useState(AppState.currentState==='active'),[shot,setShot]=useState<Shot|null>(null),[caption,setCaption]=useState(''),[attachLocation,setAttachLocation]=useState(false),[error,setError]=useState<string|null>(null);
 useEffect(()=>{mounted.current=true;const sub=AppState.addEventListener('change',s=>{if(s!=='active'){setReady(false);if(timerRef.current)clearTimeout(timerRef.current);setCountdown(0);if(recordingRef.current){interrupted.current=true;camera.current?.stopRecording();}}setActive(s==='active');});return()=>{mounted.current=false;sub.remove();if(timerRef.current)clearTimeout(timerRef.current);if(recordingRef.current)camera.current?.stopRecording();};},[nav]);
 useEffect(()=>{if(!recording)return;const t=setInterval(()=>setSeconds(Math.floor((Date.now()-start.current)/1000)),200);return()=>clearInterval(t);},[recording]);
 async function capture(){
  if(!camera.current||!ready||busyRef.current)return;if(recordingRef.current){camera.current.stopRecording();return;}
  busyRef.current=true;interrupted.current=false;setBusy(true);setError(null);
  try{
   if(mode==='picture'){const photo=await camera.current.takePictureAsync({quality:.8,exif:false});if(photo&&mounted.current)setShot({uri:photo.uri,kind:'photo',durationSeconds:0});}
   else{await pauseMusicPlayback();start.current=Date.now();recordingRef.current=true;setRecording(true);setSeconds(0);busyRef.current=false;setBusy(false);const video=await camera.current.recordAsync({maxDuration:10,maxFileSize:24*1024*1024});if(video&&mounted.current)setShot({uri:video.uri,kind:'video',durationSeconds:Math.min(10,(Date.now()-start.current)/1000)});}
  }catch(e){if(mounted.current)setError(interrupted.current?'Quay đã dừng khi MyMap ra nền. Đoạn video chưa lưu; hãy quay lại.':e instanceof Error?e.message:'Không thể chụp/quay. Hãy thử lại.');}
  finally{recordingRef.current=false;busyRef.current=false;if(mounted.current){setRecording(false);setBusy(false);}}
 }
 function shutter(){if(recordingRef.current){camera.current?.stopRecording();return;}if(countdown||busy)return;if(timer){setCountdown(3);let n=3;const tick=()=>{n--;setCountdown(n);if(n>0)timerRef.current=setTimeout(tick,1000);else if(active&&focused)void capture();};timerRef.current=setTimeout(tick,1000);}else void capture();}
 async function toggleMicrophone(){if(recording||busy)return;if(!muted){setMuted(true);return;}const p=microphone?.granted?microphone:await askMicrophone();if(p.granted)setMuted(false);else setError('Chưa có quyền micro. Bạn vẫn có thể quay video không tiếng.');}
 async function save(){
  if(!shot||busyRef.current)return;busyRef.current=true;setBusy(true);setError(null);
  try{let coords:Location.LocationObjectCoords|null=null;if(attachLocation){const p=await Location.requestForegroundPermissionsAsync();if(!p.granted)throw new Error('Cần quyền vị trí để gắn địa điểm. Bạn có thể tắt gắn vị trí.');const loc=await getDeviceCurrentPosition({accuracy:Location.Accuracy.Balanced,timeoutMs:6000});if(!loc?.coords)throw new Error('Chưa lấy được vị trí. Hãy thử lại hoặc tắt gắn vị trí.');coords=loc.coords;}
   const m=await saveMoment({...shot,caption,latitude:coords?.latitude,longitude:coords?.longitude});
   if(!mounted.current)return;
   if(route.params?.purpose==='memory'&&shot.kind==='photo'&&coords){const id=await savePhotoPinFromUri(m.uri,coords,caption);busyRef.current=false;nav.replace('MemoryDetail',{photoId:id});}
   else{busyRef.current=false;nav.replace('MomentDetail',{momentId:m.id});}
  }catch(e){setError(e instanceof Error?e.message:'Chưa lưu được khoảnh khắc.');}finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 const icon=(name:any,label:string,onPress:()=>void,selected=false,disabled=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled}} disabled={disabled} onPress={onPress} style={[s.icon,selected&&s.selected,disabled&&{opacity:.35}]}><MaterialCommunityIcons name={name} size={23} color="#fff"/></Pressable>;
 return <View style={[s.root,{paddingTop:insets.top,paddingBottom:Math.max(12,insets.bottom),paddingLeft:insets.left,paddingRight:insets.right}]}>
  <View style={s.top}>{icon('close','Đóng camera',()=>nav.goBack(),false,busy||recording)}<View style={{flex:1}}><Text style={s.title}>{shot?'Khoảnh khắc của bạn':'Camera MyMap'}</Text><Text style={s.sub}>{recording?`● ${seconds}s / 10s`:'Ảnh & video ngắn · lưu trên máy trước'}</Text></View>{!shot&&icon(flash?'flash':'flash-off','Bật/tắt đèn',()=>setFlash(!flash),flash,recording||busy)}</View>
  <View style={[s.main,landscape&&{flexDirection:'row'}]}>
   <View style={[s.finder,landscape&&{flex:1.7}]}>
    {shot?(shot.kind==='photo'?<Image source={{uri:shot.uri}} style={s.fill} resizeMode="contain"/>:<MomentVideo uri={shot.uri}/>):permission?.granted&&focused&&active?<CameraView key={`${facing}-${mode}`} ref={camera} active={focused&&active} style={StyleSheet.absoluteFill} facing={facing} mode={mode} flash={flash?'on':'off'} enableTorch={mode==='video'&&flash} mute={muted} zoom={zoom} videoQuality="720p" mirror={facing==='front'} onCameraReady={()=>setReady(true)} onMountError={e=>{setError(e.message);setReady(false);}}/>:<View style={s.permission}><MaterialCommunityIcons name="camera-outline" size={56} color="#6EDDDD"/><Text style={s.title}>Chụp ngay trong MyMap</Text><Text style={s.sub}>Camera chỉ mở khi bạn sử dụng màn hình này.</Text><Pressable style={s.button} onPress={()=>permission?.canAskAgain===false?void Linking.openSettings():void askCamera()}><Text style={[s.buttonText,{color:'#052C38'}]}>{permission?.canAskAgain===false?'Mở cài đặt camera':'Cho phép camera'}</Text></Pressable></View>}
    {!shot&&permission?.granted&&!ready&&<View style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',gap:12}]}><ActivityIndicator color="#64DBCF"/><Text style={s.sub}>Đang mở camera…</Text></View>}
    {!!countdown&&<Text style={s.countdown}>{countdown}</Text>}
    {recording&&<View style={s.recordBadge}><Text style={s.title}>● {seconds}s</Text></View>}
   </View>
   <View style={[s.controls,landscape&&{flex:1,paddingHorizontal:16}]}>
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {shot?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:12}}>
     <TextInput value={caption} onChangeText={setCaption} maxLength={500} multiline placeholder="Thêm vài dòng cho khoảnh khắc này…" placeholderTextColor="#8D9CAE" style={s.input} accessibilityLabel="Ghi chú khoảnh khắc"/>
     <Pressable accessibilityRole="switch" accessibilityState={{checked:attachLocation}} onPress={()=>setAttachLocation(!attachLocation)} style={s.location}><MaterialCommunityIcons name={attachLocation?'map-marker-check':'map-marker-off-outline'} size={22} color="#65D9D0"/><View style={{flex:1}}><Text style={s.title}>Gắn vị trí khi lưu</Text><Text style={s.sub}>{attachLocation?'Bạn chọn riêng việc gửi vị trí ở bước chia sẻ.':'Đang tắt · lưu khoảnh khắc không cần GPS'}</Text></View><MaterialCommunityIcons name={attachLocation?'toggle-switch':'toggle-switch-off-outline'} size={30} color="#65D9D0"/></Pressable>
     <View style={s.row}><Pressable disabled={busy} style={s.secondary} onPress={()=>{setShot(null);setReady(false);}}><Text style={s.buttonText}>Chụp lại</Text></Pressable><Pressable disabled={busy} style={[s.button,{flex:1}]} onPress={()=>void save()}>{busy?<ActivityIndicator color="#052629"/>:<Text style={[s.buttonText,{color:'#052C38'}]}>Lưu & chọn người nhận</Text>}</Pressable></View>
    </ScrollView>:<>
     <View style={s.row}>{(['picture','video'] as const).map(x=><Pressable key={x} disabled={recording||busy||!!countdown} onPress={()=>{if(mode!==x){setReady(false);setMode(x);}}} style={[s.mode,mode===x&&s.selected]}><Text style={s.buttonText}>{x==='picture'?'Ảnh':'Video 10s'}</Text></Pressable>)}</View>
     <View style={s.row}>{icon(timer?'timer':'timer-off-outline','Hẹn giờ 3 giây',()=>setTimer(!timer),timer,recording||busy||!!countdown)}{mode==='video'?icon(muted?'microphone-off':'microphone','Bật/tắt micro',()=>void toggleMicrophone(),!muted,recording||busy):icon('magnify-plus-outline','Đổi mức zoom',()=>setZoom(zoom===0?.15:0),zoom>0,recording||busy)}{icon('camera-flip-outline','Đổi camera trước/sau',()=>{setReady(false);setFacing(facing==='back'?'front':'back');},false,recording||busy||!!countdown)}</View>
     <Pressable accessibilityRole="button" accessibilityLabel={recording?'Dừng quay':mode==='video'?'Bắt đầu quay video':'Chụp ảnh'} disabled={!ready||busy||!active||!!countdown} onPress={shutter} style={[s.shutter,(mode==='video'||recording)&&{borderColor:'#FF8A92'}]}>{busy?<ActivityIndicator color="#fff"/>:<View style={[s.shutterInner,mode==='video'&&{backgroundColor:'#EF6373'},recording&&{borderRadius:7,width:30,height:30}]}/>}</Pressable>
    </>}
   </View>
  </View>
 </View>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:'#08121F'},top:{flexDirection:'row',alignItems:'center',gap:12,padding:12},main:{flex:1,gap:14},finder:{flex:1,backgroundColor:'#02060C',borderRadius:22,overflow:'hidden',marginHorizontal:12},fill:{width:'100%',height:'100%'},controls:{paddingHorizontal:20,paddingBottom:12,gap:13},title:{color:'#F6FAFF',fontSize:16,fontWeight:'700'},sub:{color:'#A5B5C8',fontSize:11,lineHeight:17},icon:{width:48,height:48,borderRadius:24,backgroundColor:'#1D3042',alignItems:'center',justifyContent:'center'},selected:{backgroundColor:'#345B63'},row:{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:16},mode:{paddingHorizontal:20,paddingVertical:12,borderRadius:24,minHeight:48},shutter:{alignSelf:'center',width:82,height:82,borderRadius:42,borderWidth:3,borderColor:'#F4FAFF',alignItems:'center',justifyContent:'center'},shutterInner:{width:66,height:66,borderRadius:34,backgroundColor:'#F4FAFF'},permission:{flex:1,alignItems:'center',justifyContent:'center',padding:28,gap:18},button:{backgroundColor:'#64DBCF',padding:16,borderRadius:18,minHeight:50,alignItems:'center'},buttonText:{color:'#F6FAFF',fontSize:14,fontWeight:'700'},secondary:{padding:16,borderRadius:18,backgroundColor:'#22384D',minHeight:50},input:{backgroundColor:'#152739',borderRadius:18,padding:16,color:'#F6FAFF',minHeight:72,fontSize:15},location:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:8},error:{color:'#FFADB4',fontSize:13,lineHeight:18},countdown:{position:'absolute',alignSelf:'center',top:'40%',fontSize:80,color:'#fff',fontWeight:'800'},recordBadge:{position:'absolute',top:16,right:16,backgroundColor:'#9C3047',padding:10,borderRadius:16}});
