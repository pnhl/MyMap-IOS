const test=require('node:test'),assert=require('node:assert/strict');
const {loadService}=require('./service-loader.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const snapshots=[],files=new Set(),storage=new Map();let owner='a',release,waiting=false;
 const fs={cacheDirectory:'file:///cache/',copyAsync:async({to})=>files.add(to),deleteAsync:async(uri)=>files.delete(uri),getInfoAsync:async()=>({exists:true,size:100}),readDirectoryAsync:async()=>{
  if(waiting){waiting=false;await new Promise(r=>release=r);}return [...files].filter(x=>x.startsWith('file:///group/')).map(x=>x.split('/').at(-1));
 }};
 const api=loadService('src/services/momentWidget.ts',{
  '@react-native-async-storage/async-storage':{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>storage.set(k,v),removeItem:async k=>storage.delete(k)},
  'expo-file-system/legacy':fs,'expo-image-manipulator':{SaveFormat:{JPEG:'jpg'},manipulateAsync:async()=>({uri:'file:///resized.jpg'})},
  '../widgets/MomentWidget':{updateTimeline:x=>snapshots.push(x)},'expo-widgets':{widgetsDirectory:'file:///group/'},
 },{process:{env:{EXPO_PUBLIC_ENABLE_IOS_WIDGET:'true'}}});
 return{api,snapshots,files,current:async()=>owner,change:()=>owner='b',block:()=>waiting=true,release:()=>release()};
}
const moment={coverUri:'file:///photo.jpg',caption:'Private',capturedAt:Date.now(),id:'one'};
test('an account change while resizing never publishes the previous account photo',async()=>{
 const f=fixture();const update=f.api.updateMomentWidget(moment,'a',f.current,false);f.change();await update;assert.equal(f.snapshots.length,0);assert.equal(f.files.size,0);
});
test('clearing selection replaces future timelines and serializes file deletion against updates',async()=>{
 const f=fixture();f.block();const first=f.api.updateMomentWidget(moment,'a',f.current,true);await tick();
 const second=f.api.updateMomentWidget({...moment,id:'two'},'a',f.current,true);const clear=f.api.clearMomentWidget(true);f.change();f.release();await Promise.all([first,second,clear]);
 assert.equal(f.snapshots.at(-1)[0].props.image,'');assert.equal(f.snapshots.at(-1).length,1);assert.equal(f.files.size,0);
});
