const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function fixture(){
 let user={id:'alice',is_anonymous:false},offline=false,seq=0;const rows=new Map(),files=new Map(),uploads=[],published=[];
 const db={execAsync:async()=>{},runAsync:async(sql,...v)=>{if(sql.startsWith('INSERT'))rows.set(v[0],{account:v[1],payload:v[2]});if(sql.startsWith('UPDATE')){const row=rows.get(v[2]);if(row&&(row.account==='local'||JSON.parse(row.payload).unclaimed)){rows.set(v[2],{account:v[0],payload:v[1]});}}if(sql.startsWith('DELETE')){if(rows.get(v[0])?.account===v[1])rows.delete(v[0]);}},getAllAsync:async(sql,key)=>[...rows.values()].filter(r=>sql.includes('account<>')?r.account!==key&&(r.account==='local'||JSON.parse(r.payload).unclaimed)&&JSON.parse(r.payload).status==='local':r.account===key),withExclusiveTransactionAsync:async fn=>fn(db)};
 class File{constructor(uri){this.uri=uri;}get exists(){return files.has(this.uri);}get size(){return files.get(this.uri)||0;}async arrayBuffer(){return new ArrayBuffer(this.size);}}
 const bucket={upload:async(path,data)=>{if(offline) return {error:new Error('Offline')};uploads.push({path,bytes:data.byteLength});return {error:null};},remove:async()=>({error:null})};
 const mocks={'expo':{requireOptionalNativeModule:()=>null},'./momentWidget':{momentWidgetSupported:false},'expo-file-system/legacy':{documentDirectory:'file:///private/',makeDirectoryAsync:async()=>{},copyAsync:async({from,to})=>{if(!files.has(from))throw Error('Missing file');files.set(to,files.get(from));},deleteAsync:async(uri)=>{for(const name of files.keys())if(name.startsWith(uri))files.delete(name);}},'expo-file-system':{File},'expo-crypto':{randomUUID:()=>`00000000-0000-4000-8000-${String(++seq).padStart(12,'0')}`},'expo-video-thumbnails':{getThumbnailAsync:async()=>({uri:'file:///cover.jpg'})},'react-native':{NativeModules:{},AppState:{currentState:'active'}},'../db/database':{getDb:async()=>db},'./auth':{getCurrentUser:async()=>user,subscribeAuthState:()=>()=>{}},'./supabase':{supabase:{storage:{from:()=>bucket},rpc:async(name,args)=>{if(offline)return {error:{message:'Offline'}};if(name==='mm_identity')return {data:'canonical-alice',error:null};published.push(args);return {data:args.p_id,error:null};}}}};
 const loaded={};function load(path){if(loaded[path])return loaded[path];const module={exports:{}};const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(source,{module,exports:module.exports,require:name=>name==='./momentPolicy'?load('src/services/momentPolicy.ts'):mocks[name]??{},Date,Set,Error,Number,Math,JSON,Promise,setInterval,clearInterval});loaded[path]=module.exports;return module.exports;}
 return {api:load('src/services/moments.ts'),files,uploads,published,setOffline:x=>offline=x,setUser:x=>user=x};
}
test('offline capture is durable and never auto-publishes a private local photo',async()=>{
 const f=fixture();f.files.set('file:///capture.jpg',2048);f.setOffline(true);const m=await f.api.saveMoment({uri:'file:///capture.jpg',kind:'photo',durationSeconds:0,caption:'Today'});
 assert.equal(m.status,'local');assert.equal((await f.api.listLocalMoments()).length,1);assert.ok(f.files.has(m.uri));await f.api.syncMomentQueue();assert.equal(f.uploads.length,0);
});
test('failed upload preserves local media and retry omits location unless explicitly chosen',async()=>{
 const f=fixture();f.files.set('file:///capture.jpg',2048);const m=await f.api.saveMoment({uri:'file:///capture.jpg',kind:'photo',durationSeconds:0,caption:'Today',latitude:10,longitude:106});
 // Identity resolved, upload fails. Simulate a transport failure at the file step.
 const original=File=>File;f.files.delete(m.uri);const failed=await f.api.queueMoment(m,['friend'],null,false);assert.equal(failed.status,'failed');
 f.files.set(m.uri,2048);await f.api.retryMoment(failed);const published=(await f.api.listLocalMoments())[0];assert.equal(published.status,'published');assert.equal(f.published[0].p_lat,null);assert.equal(f.published[0].p_lon,null);assert.deepEqual(Array.from(f.published[0].p_recipients),['friend']);
});
test('switching accounts hides drafts and blocks retry, deletion and sharing queues for a previous account',async()=>{
 const f=fixture();f.files.set('file:///capture.jpg',2048);const m=await f.api.saveMoment({uri:'file:///capture.jpg',kind:'photo',durationSeconds:0,caption:''});f.setUser({id:'bob',is_anonymous:false});
 assert.equal((await f.api.listLocalMoments()).length,0);await assert.rejects(()=>f.api.queueMoment(m,[],null,false),/tài khoản khác/);await assert.rejects(()=>f.api.retryMoment(m),/tài khoản khác/);await assert.rejects(()=>f.api.deleteMoment(m),/tài khoản khác/);assert.ok(f.files.has(m.uri));
});
test('oversize camera files never create a draft or copy media',async()=>{
 const f=fixture();f.files.set('file:///capture.mp4',26*1024*1024);await assert.rejects(()=>f.api.saveMoment({uri:'file:///capture.mp4',kind:'video',durationSeconds:10,caption:''}),/25 MB/);assert.equal((await f.api.listLocalMoments()).length,0);
});

test('explicit guest import moves only unclaimed local captures and never sends them',async()=>{
 const f=fixture();f.files.set('file:///capture.jpg',2048);
 const regular=await f.api.saveMoment({uri:'file:///capture.jpg',kind:'photo',durationSeconds:0,caption:'Alice private'});
 f.setUser({id:'guest',is_anonymous:true});const guest=await f.api.saveMoment({uri:'file:///capture.jpg',kind:'photo',durationSeconds:0,caption:'Guest capture'});
 f.setUser({id:'bob',is_anonymous:false});assert.equal((await f.api.listLocalMoments()).length,0);
 const pending=await f.api.listUnclaimedMoments();assert.deepEqual(Array.from(pending,m=>m.id),[guest.id]);
 await f.api.claimUnclaimedMoments();const claimed=await f.api.listLocalMoments();assert.equal(claimed.length,1);assert.equal(claimed[0].id,guest.id);assert.equal(claimed[0].status,'local');assert.equal(claimed[0].unclaimed,false);assert.equal(f.uploads.length,0);
 assert.equal((await f.api.listUnclaimedMoments()).length,0);f.setUser({id:'alice',is_anonymous:false});assert.equal((await f.api.listLocalMoments())[0].id,regular.id);
});
