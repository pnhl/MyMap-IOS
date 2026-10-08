const test=require('node:test'),assert=require('node:assert/strict');
const{loadService}=require('./service-loader.cjs');
function socialFixture(){let user={id:'alice',is_anonymous:false},coordinate={latitude:21.03,longitude:105.85},response=[],calls=[];const service=loadService('src/services/friendSocial.ts',{'react-native':{AppState:{currentState:'active'}},'./auth':{getCurrentUser:async()=>({...user})},'./sharingPrivacy':{sharedCoordinate:async()=>coordinate},'./supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return{data:response,error:null};}}}});return{service,calls,setCoordinate:p=>{coordinate=p;},setUser:id=>{user.id=id;},anonymous:()=>{user.is_anonymous=true;},respond:data=>{response=data;}};}
test('map pins use the shared privacy gate and the selected recipient',async()=>{
 const f=socialFixture();await f.service.postMapChatMessage({message:'Hẹn ở đây',latitude:21.02851,longitude:105.85423,targetFriendId:'bob'});assert.equal(f.calls[0].name,'mm_post_map_note');assert.equal(f.calls[0].args.p_lat,21.03);assert.equal(f.calls[0].args.p_lon,105.85);assert.equal(f.calls[0].args.p_target,'bob');
});
test('hidden or warming-up coordinates never become a map pin',async()=>{
 const f=socialFixture();f.setCoordinate(null);await assert.rejects(f.service.postMapChatMessage({message:'Hẹn',latitude:21,longitude:105}),/đang ẩn/);assert.equal(f.calls.length,0);
});
test('signed-out/anonymous users read no friend map notes and cannot send interactions',async()=>{
 const f=socialFixture();f.anonymous();assert.equal((await f.service.getMapChatMessages()).length,0);await assert.rejects(f.service.sendFriendInteraction('bob','heart'));assert.equal(f.calls.length,0);
});
test('voice files cannot enter the friend-interaction metadata channel',async()=>{
 const f=socialFixture();await assert.rejects(f.service.sendFriendInteraction('bob','voice',{uri:'file:///private.m4a'}));assert.equal(f.calls.length,0);
});
test('per-friend precise mode cannot weaken a global approximate or frozen setting',async()=>{
 const values=new Map(),storage={getItem:async k=>values.get(k)||null,setItem:async(k,v)=>values.set(k,v)};
 const ghost=loadService('src/services/ghostMode.ts',{'@react-native-async-storage/async-storage':storage,'./auth':{getCurrentUser:async()=>({id:'alice'})},'./supabase':{supabase:{rpc:async()=>({})}}});
 values.set('mymap.ghost_mode.friends.v1:alice',JSON.stringify({bob:'precise'}));values.set('mymap.ghost_mode.global.v1:alice','fuzzy');assert.equal(await ghost.getEffectiveGhostModeForFriend('bob'),'fuzzy');values.set('mymap.ghost_mode.global.v1:alice','frozen');assert.equal(await ghost.getEffectiveGhostModeForFriend('bob'),'frozen');values.set('mymap.ghost_mode.friends.v1:alice','malformed');await assert.rejects(ghost.getEffectiveGhostModeForFriend('bob'));
});
test('a successful server revocation removes a cached friend coordinate',async()=>{
 const records=new Map();let data=[{id:'bob',user_id:'bob',latitude:21,longitude:105,updated_at:new Date().toISOString()}];const service=loadService('src/services/realtimeFriends.ts',{'@react-native-async-storage/async-storage':{getItem:async k=>records.get(k)||null,setItem:async(k,v)=>records.set(k,v)},'./supabase':{supabase:{rpc:async()=>({data,error:null})}},'./auth':{getCurrentUser:async()=>({id:'alice'})},'./accountApi':{accountApi:async()=>({owner:'alice',assertCurrent:async()=>{},client:{rpc:async()=>({data,error:null})}})},'./profileAvatars':{resolveProfileAvatar:async()=>null},'./friendStatus':{},'./musicStatus':{},'../utils/geo':{},'./sharingPrivacy':{},'./friendSocial':{}});
 assert.equal((await service.getLiveFriends()).length,1);data=[];assert.equal((await service.getLiveFriends()).length,0);assert.equal(JSON.parse(records.get('mymap.realtime_friends.cache.v4:alice')).length,0);
});
test('an account switch while freezing cannot copy the previous account’s coordinate to the next account',async()=>{
 const values=new Map();let owner='alice';const ghost=loadService('src/services/ghostMode.ts',{'@react-native-async-storage/async-storage':{getItem:async k=>values.get(k)||null,setItem:async(k,v)=>{values.set(k,v);owner='bob';}},'./auth':{getCurrentUser:async()=>({id:owner,is_anonymous:true})},'./supabase':{supabase:{rpc:async()=>({})}}});await assert.rejects(ghost.setGlobalGhostMode('frozen',{latitude:21,longitude:105}),/Tài khoản/);assert.ok(!values.has('mymap.ghost_mode.frozen_coords.v1:bob'));assert.ok(!values.has('mymap.ghost_mode.global.v1:bob'));assert.equal(JSON.parse(values.get('mymap.ghost_mode.frozen_coords.v1:alice')).latitude,21);
});
test('place visitors count only recorded stays and cannot infer precise visits from fuzzy positions',()=>{
 const geo=loadService('src/utils/geo.ts'),places=loadService('src/services/smartPlaces.ts',{'@react-native-async-storage/async-storage':{},'../utils/geo':geo,'./placeMetadata':{}}),now=Date.now(),friend={id:'friend',displayName:'Bạn',avatarUrl:null,latitude:21,longitude:105,ghostMode:'precise',lastSeenMs:now-60000,rankingScore:99};
 assert.equal(places.getFriendsWhoVisitedPlace(21,105,[friend])[0].visitCount,null);assert.equal(places.getFriendsWhoVisitedPlace(21,105,[{...friend,ghostMode:'fuzzy'}]).length,0);assert.equal(places.getFriendsWhoVisitedPlace(21,105,[{...friend,lastSeenMs:now-600000}]).length,0);
 const fp={latitude:21,longitude:105,timestamp:now-600000,dwellMinutes:5};const [visitor]=places.getFriendsWhoVisitedPlace(21,105,[{...friend,footprints:[fp,fp,{...fp,timestamp:now-300000,dwellMinutes:2}]}]);assert.equal(visitor.visitCount,1);assert.equal(visitor.source,'footprints');
});
