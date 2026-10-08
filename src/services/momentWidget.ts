import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FS from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import type {Moment} from '../types/moment';
export const momentWidgetSupported=process.env.EXPO_PUBLIC_ENABLE_IOS_WIDGET==='true';
export type WidgetFilter={mode:'friends'|'personal'|'anniversary';author?:string;group?:string;momentId?:string};
const KEY='mymap.ios.widget-selection.v1';
let generation=0;
export async function widgetSelection():Promise<{account:string;filter:WidgetFilter}|null>{
 const raw=await AsyncStorage.getItem(KEY);if(!raw)return null;
 try{return JSON.parse(raw);}catch{return null;}
}
export async function saveWidgetSelection(account:string,filter:WidgetFilter){await AsyncStorage.setItem(KEY,JSON.stringify({account,filter}));}
async function runtime(){
 const [{default:widget},{widgetsDirectory}]=await Promise.all([import('../widgets/MomentWidget'),import('expo-widgets')]);
 if(!widgetsDirectory)throw Error('Bản iOS chưa được cấp App Group cho widget.');
 return{widget,directory:widgetsDirectory.endsWith('/')?widgetsDirectory:widgetsDirectory+'/'};
}
export async function clearMomentWidget(removeSelection=false){
 generation++;
 if(removeSelection)await AsyncStorage.removeItem(KEY);
 if(!momentWidgetSupported)return;
 const {widget,directory}=await runtime();
 widget.updateSnapshot({image:'',caption:'Mở MyMap để chọn khoảnh khắc',date:'',url:'mymap://moments'});
 // Images are copied only after explicit selection and are erased on account changes.
 const paths=await FS.readDirectoryAsync(directory).catch(()=>[]);
 await Promise.all(paths.filter(p=>p.startsWith('mymap-moment-')).map(p=>FS.deleteAsync(directory+p,{idempotent:true})));
}
export async function updateMomentWidget(moment:Moment|null,owner:string,currentOwner:()=>Promise<string>,friends:boolean){
 if(!momentWidgetSupported)return;
 const token=++generation,{widget,directory}=await runtime();
 if(!moment){if(token===generation)await clearMomentWidget();return;}
 const input=FS.cacheDirectory+'mymap-widget-'+token+'.jpg';
 let resized:string|null=null,copied:string|null=null;
 try{
  if(moment.coverUri.startsWith('file://'))await FS.copyAsync({from:moment.coverUri,to:input});
  else{if(!moment.coverUri.startsWith('https://'))throw Error('Ảnh widget cần nguồn HTTPS.');const result=await FS.downloadAsync(moment.coverUri,input);if(result.status!==200)throw Error('Chưa tải được ảnh widget.');}
  const info=await FS.getInfoAsync(input);if(!info.exists||info.size>25*1024*1024)throw Error('Ảnh widget vượt giới hạn.');
  const output=await ImageManipulator.manipulateAsync(input,[{resize:{width:512}}],{compress:.75,format:ImageManipulator.SaveFormat.JPEG});resized=output.uri;
  if(token!==generation||await currentOwner()!==owner)return;
  copied=directory+'mymap-moment-'+token+'.jpg';await FS.copyAsync({from:resized,to:copied});
  if(token!==generation||await currentOwner()!==owner){await FS.deleteAsync(copied,{idempotent:true});return;}
  widget.updateTimeline([
   {date:new Date(),props:{image:copied,caption:moment.caption.slice(0,120),date:new Date(moment.capturedAt).toLocaleDateString('vi-VN'),url:'mymap://moment/'+moment.id}},
   {date:new Date(Date.now()+(friends?15*60*1000:24*60*60*1000)),props:{image:'',caption:'Mở MyMap để cập nhật khoảnh khắc',date:'',url:'mymap://moments'}},
  ]);
  const files=await FS.readDirectoryAsync(directory);await Promise.all(files.filter(p=>p.startsWith('mymap-moment-')&&directory+p!==copied).map(p=>FS.deleteAsync(directory+p,{idempotent:true})));
 }finally{await FS.deleteAsync(input,{idempotent:true}).catch(()=>{});if(resized)await FS.deleteAsync(resized,{idempotent:true}).catch(()=>{});}
}
