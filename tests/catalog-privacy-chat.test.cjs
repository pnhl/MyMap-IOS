const{loadPinnedService}=require('./account-api-fixture.cjs');
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const{loadService,memoryDatabase}=require('./service-loader.cjs');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function privacyFixture(){
 const records=new Map(),calls=[];let user={id:'alice',is_anonymous:true},now=1000000,mask=async(latitude,longitude)=>({latitude,longitude,isMasked:false}),afterWrite=()=>{};
 class Clock extends Date{static now(){return now;}}
 const service=loadService('src/services/sharingPrivacy.ts',{'@react-native-async-storage/async-storage':{getItem:async k=>records.get(k)||null,setItem:async(k,v)=>{records.set(k,v);afterWrite();},removeItem:async k=>records.delete(k)},'./auth':{getCurrentUser:async()=>({...user})},'./ghostMode':{applyGhostModeToCoords:async p=>({...p,isFuzzy:false,isFrozen:false})},'./privacyZones':{maskCoordinateIfPrivate:(...args)=>mask(...args)},'./supabase':{supabase:{rpc:async(...args)=>{calls.push(args);return{error:{message:'offline'}};}}}},{Date:Clock});
 return{service,records,calls,setUser:id=>{user.id=id;},setClock:value=>{now=value;},setMask:fn=>{mask=fn;},signedIn:()=>{user.is_anonymous=false;},afterWrite:fn=>{afterWrite=fn;}};
}
const precise={latitude:21,longitude:105};
test('delayed sharing warms up without leaking a current fix, then publishes the old fix',async()=>{
 const f=privacyFixture();await f.service.saveSharingPrivacy({privateTrip:false,delayMinutes:5,ghostUntil:null});assert.equal(await f.service.sharedCoordinate(precise),null);f.setClock(1300001);const published=await f.service.sharedCoordinate({latitude:22,longitude:106});assert.equal(published.latitude,21);assert.equal(published.longitude,105);assert.equal(published.isDelayed,true);
 f.setUser('bob');assert.equal(await f.service.sharedCoordinate({latitude:23,longitude:107}).then(p=>p.isDelayed),false);assert.ok(!f.records.has('mymap.sharing:bob:delay'));
});
test('private trip stays private locally even when the server update fails',async()=>{
 const f=privacyFixture();f.signedIn();await assert.rejects(f.service.saveSharingPrivacy({privateTrip:true,delayMinutes:0,ghostUntil:null}),/máy chủ/);assert.equal(await f.service.sharedCoordinate(precise),null);assert.equal(f.calls.length,1);
});
test('changing privacy invalidates an in-flight coordinate after slow masking',async()=>{
 const f=privacyFixture(),entered=deferred(),resume=deferred();f.setMask(async(latitude,longitude)=>{entered.resolve();await resume.promise;return{latitude,longitude,isMasked:false};});const publishing=f.service.sharedCoordinate(precise);await entered.promise;await f.service.saveSharingPrivacy({privateTrip:true,delayMinutes:0,ghostUntil:null});resume.resolve();assert.equal(await publishing,null);
});
test('switching account invalidates an in-flight coordinate',async()=>{
 const f=privacyFixture();f.setMask(async(latitude,longitude)=>{f.setUser('bob');return{latitude,longitude};});assert.equal(await f.service.sharedCoordinate(precise),null);
});
test('settings never submit a previous account’s privacy choice under the new account',async()=>{
 const f=privacyFixture();f.signedIn();f.afterWrite(()=>f.setUser('bob'));await assert.rejects(f.service.saveSharingPrivacy({privateTrip:true,delayMinutes:0,ghostUntil:null}),/Tài khoản/);assert.equal(f.calls.length,0);assert.equal(JSON.parse(f.records.get('mymap.sharing:alice')).privateTrip,true);assert.ok(!f.records.has('mymap.sharing:bob'));
});
test('corrupt privacy storage and invalid GPS fail closed',async()=>{
 const f=privacyFixture();f.records.set('mymap.sharing:alice','null');await assert.rejects(f.service.sharedCoordinate(precise));f.records.clear();await assert.rejects(f.service.sharedCoordinate({latitude:Infinity,longitude:105}));assert.equal(f.records.size,0);
});
function chatFixture(){
 const db=memoryDatabase(),sent=new Map(),calls=[];let send=async args=>{sent.set(args.p_id,args);return{};},cancel=async args=>{sent.delete(args.p_id);return{};};
 const service=loadPinnedService('src/services/privateChat.ts',{'expo-crypto':{randomUUID:()=>crypto.randomUUID()},'expo-file-system':{Directory:class{},File:class{},Paths:{}},'../db/database':{getDb:async()=>db},'./auth':{getCurrentUser:async()=>({id:'alice',is_anonymous:false})},'./supabase':{supabase:{rpc:async(name,args)=>{calls.push(name);if(name==='mm_identity')return{data:'canonical'};if(name==='mm_send_message')return send(args);if(name==='mm_cancel_message')return cancel(args);return{};}}}});
 return{service,db,sent,calls,onSend:fn=>{send=fn;},onCancel:fn=>{cancel=fn;}};
}
test('canceling a text during transmission cannot be lost by the send completion',async()=>{
 const f=chatFixture(),entered=deferred(),resume=deferred();try{
 const id=await f.service.queueChat('room','text','Tin đang gửi');f.onSend(async args=>{entered.resolve();await resume.promise;f.sent.set(args.p_id,args);return{};});const sending=f.service.flushChat();await entered.promise;const canceling=f.service.discardChat(id);
 // Allow discard to persist its durable flag before the server responds.
 await new Promise(resolve=>setImmediate(resolve));resume.resolve();await Promise.all([sending,canceling]);assert.equal(f.sent.size,0);assert.equal((await f.service.pendingChat()).length,0);assert.ok(f.calls.includes('mm_cancel_message'));
 }finally{f.db.close();}
});
test('offline cancellation is durable and retries only cancellation',async()=>{
 const f=chatFixture();try{const id=await f.service.queueChat('room','text','Hủy khi mất mạng');f.onCancel(async()=>({error:{message:'offline'}}));await f.service.discardChat(id);const[o]=await f.service.pendingChat();assert.equal(o.canceled,true);assert.ok(!f.calls.includes('mm_send_message'));f.onCancel(async()=>({}));await f.service.flushChat();assert.equal((await f.service.pendingChat()).length,0);assert.ok(!f.calls.includes('mm_send_message'));}finally{f.db.close();}
});
test('failed sends survive retry without duplicating the client message identity',async()=>{
 const f=chatFixture();try{const id=await f.service.queueChat('room','text','Gửi lại');f.onSend(async()=>({error:{message:'offline'}}));await f.service.flushChat();assert.equal((await f.service.pendingChat())[0].id,id);f.onSend(async args=>{f.sent.set(args.p_id,args);return{};});await f.service.flushChat();assert.equal(f.sent.size,1);assert.equal((await f.service.pendingChat()).length,0);}finally{f.db.close();}
});
