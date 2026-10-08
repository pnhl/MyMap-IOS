const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const radio=(id='radio-a')=>({id,title:id,artist:'Radio',uri:`https://example.test/${id}`,kind:'radio'});
const local=(id='audio-a')=>({id,title:id,artist:'Local',uri:`file:///app/document/music/${id}.mp3`,kind:'local'});

function fixture(saved=null){
 let now=100000,appChange,created=0,clears=0,mode=[],active=[],metadata=[];
 const stored=new Map(saved?[['mymap.music.library.v1',JSON.stringify(saved)]]:[]),files=new Map(),timers=new Map();
 let timerId=0,picked={canceled:true,result:null};
 const FakeDate=class extends Date{static now(){return now;}};
 class Directory{constructor(...parts){this.uri=parts.map(p=>typeof p==='string'?p:p.uri).join('/');}create(){}get size(){let size=0;for(const [uri,entry] of files)if(uri.startsWith(this.uri+'/'))size+=entry.size;return size;}}
 class File{constructor(...parts){this.uri=parts.map(p=>typeof p==='string'?p:p.uri).join('/');}get name(){return this.uri.split('/').pop();}get type(){return files.get(this.uri)?.type||'';}get size(){return files.get(this.uri)?.size||0;}get exists(){return files.has(this.uri);}delete(){files.delete(this.uri);}async copy(target){files.set(target.uri,{...files.get(this.uri)});}static async pickFileAsync(){return picked;}}
 const status={id:'one',currentTime:0,duration:120,playing:false,isBuffering:false,isLoaded:false,didJustFinish:false,playbackState:'idle'};
 const player={playing:false,volume:1,events:[],replacements:[],locks:[],removed:0,addListener(_,callback){this.events.push(callback);return{remove(){}};},replace(uri){this.replacements.push(uri);},play(){},pause(){this.deliver({playing:false});},clearLockScreenControls(){this.locks.push(false);},setActiveForLockScreen(value,meta,options){this.locks.push({value,meta,options});},seekTo:async seconds=>{player.deliver({currentTime:seconds,didJustFinish:false});},remove(){this.removed++;},deliver(next){Object.assign(status,next);this.playing=status.playing;for(const callback of this.events)callback({...status});}};
 const mocks={
  '@react-native-async-storage/async-storage':{getItem:async key=>stored.get(key)||null,setItem:async(key,value)=>stored.set(key,value)},
  'expo-file-system':{Directory,File,Paths:{document:{uri:'file:///app/document'}}},
  'react-native':{Platform:{OS:'android'},AppState:{addEventListener(_,callback){appChange=callback;return{remove(){}};}}},
  'expo-audio':{createAudioPlayer(){created++;return player;},setAudioModeAsync:async value=>mode.push(value),setIsAudioActiveAsync:async value=>active.push(value)},
  './musicStatus':{clearUserMusicStatus:async()=>{clears++;},setUserMusicStatus:async value=>metadata.push(value)},
  './travelPlatform':{travelNative:{getAudioDocumentInfo:async uri=>files.get(uri)?.document||{name:null,mimeType:null}}},
 };
 function load(relative){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync(relative,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name],Date:FakeDate,Math,Set,Map,Promise,Number,decodeURIComponent,setTimeout:(callback,ms)=>{const id=++timerId;timers.set(id,{callback,at:now+ms});return id;},clearTimeout:id=>timers.delete(id)});return module.exports;}
 const library=load('src/services/musicLibrary.ts');mocks['./musicLibrary']=library;const service=load('src/services/musicPlayback.ts');
 return{service,library,player,stored,files,active,mode,metadata,created:()=>created,clears:()=>clears,pick:items=>{picked={canceled:false,result:items.map(item=>{files.set(item.uri,{size:item.size,type:item.type,document:item.document});return new File(item.uri);})};},advance:async ms=>{now+=ms;const due=[...timers.entries()].filter(([,timer])=>timer.at<=now);for(const [id,timer] of due){timers.delete(id);timer.callback();}await tick();await tick();},foreground:async()=>{appChange('active');await tick();await tick();}};
}

test('saved queue restores paused without creating or starting a native player',async()=>{
 const f=fixture({queue:[radio()],currentIndex:0,shareNowPlaying:true});await f.service.initializeMusicPlayback();
 assert.equal(f.created(),0);assert.equal(f.service.getMusicPlaybackSnapshot().playing,false);assert.equal(f.service.getMusicPlaybackSnapshot().current.id,'radio-a');assert.equal(f.clears(),1);
});

test('an unresponsive stream times out, releases audio focus and can be retried',async()=>{
 const f=fixture();await f.service.playMusicItem(radio());await f.advance(20001);
 const failed=f.service.getMusicPlaybackSnapshot();assert.equal(failed.buffering,false);assert.equal(failed.playing,false);assert.match(failed.error,/phản hồi quá lâu/);assert.equal(f.active.at(-1),false);
 await f.service.toggleMusicPlayback();assert.equal(f.player.replacements.length,2);f.player.deliver({isLoaded:true,playing:true});await f.advance(20001);assert.equal(f.service.getMusicPlaybackSnapshot().playing,true);assert.equal(f.service.getMusicPlaybackSnapshot().error,null);
});

test('replaying a finished track ignores the old completion event during native seeking',async()=>{
 const f=fixture();await f.service.playMusicItem(local());f.player.deliver({isLoaded:true,playing:true});f.player.deliver({didJustFinish:true,playing:false});await tick();await tick();
 f.player.seekTo=async()=>{f.player.deliver({didJustFinish:true,playing:false});await tick();f.player.deliver({didJustFinish:false,isLoaded:true,currentTime:0});};
 await f.service.toggleMusicPlayback();await tick();assert.equal(f.active.at(-1),true);f.player.deliver({playing:true,didJustFinish:false});assert.equal(f.service.getMusicPlaybackSnapshot().playing,true);
});

test('map and music consumers share one player; displayed playing follows native status',async()=>{
 const f=fixture();let updatesA=0,updatesB=0;const stopA=f.service.subscribeMusicPlayback(()=>updatesA++),stopB=f.service.subscribeMusicPlayback(()=>updatesB++);
 await f.service.playMusicItem(radio(),[radio(),radio('radio-b')]);assert.equal(f.service.getMusicPlaybackSnapshot().playing,false);
 f.player.deliver({isLoaded:true,playing:true});assert.equal(f.service.getMusicPlaybackSnapshot().playing,true);
 await f.service.nextMusicItem();assert.equal(f.created(),1);assert.equal(f.service.getMusicPlaybackSnapshot().current.id,'radio-b');assert.ok(updatesA>0&&updatesB>0);stopA();stopB();
});

test('pause clears media controls and releases audio focus; resume retains source',async()=>{
 const f=fixture();await f.service.playMusicItem(local());f.player.deliver({isLoaded:true,playing:true,currentTime:25});
 await f.service.pauseMusicPlayback();assert.equal(f.active.at(-1),false);assert.equal(f.player.locks.at(-1),false);
 await f.service.toggleMusicPlayback();assert.equal(f.player.replacements.length,1);assert.equal(f.active.at(-1),true);assert.equal(f.mode.at(-1).interruptionMode,'doNotMix');assert.equal(f.mode.at(-1).shouldPlayInBackground,true);
});

test('queue advances only once for repeated completion event; repeat one seeks local track',async()=>{
 const f=fixture();await f.service.playMusicItem(local(),[local(),local('audio-b')]);f.player.deliver({isLoaded:true,playing:true});
 f.player.deliver({didJustFinish:true,playing:false});f.player.deliver({didJustFinish:true});await tick();await tick();
 assert.equal(f.service.getMusicPlaybackSnapshot().current.id,'audio-b');assert.equal(f.player.replacements.length,2);
 await f.service.setMusicRepeat('one');f.player.deliver({isLoaded:true,didJustFinish:false,playing:true,currentTime:120});f.player.deliver({didJustFinish:true,playing:false});await tick();await tick();assert.equal(f.service.getMusicPlaybackSnapshot().current.id,'audio-b');assert.equal(f.service.getMusicPlaybackSnapshot().position,0);
});

test('repeat off stops at queue end; manual next wraps and shuffle chooses a different item',async()=>{
 const f=fixture();await f.service.playMusicItem(local('audio-b'),[local(),local('audio-b')]);f.player.deliver({isLoaded:true,playing:true});f.player.deliver({didJustFinish:true,playing:false});await tick();await tick();
 assert.equal(f.active.at(-1),false);assert.equal(f.service.getMusicPlaybackSnapshot().current.id,'audio-b');
 await f.service.nextMusicItem();assert.equal(f.service.getMusicPlaybackSnapshot().current.id,'audio-a');await f.service.setMusicShuffle(true);await f.service.nextMusicItem();assert.equal(f.service.getMusicPlaybackSnapshot().current.id,'audio-b');
});

test('sharing is opt-in and writes only on semantic changes, never each position tick',async()=>{
 const f=fixture();await f.service.playMusicItem(radio());f.player.deliver({isLoaded:true,playing:true});await tick();assert.equal(f.metadata.length,0);
 await f.service.setMusicSharing(true);await tick();assert.equal(f.metadata.length,1);f.player.deliver({currentTime:10});f.player.deliver({currentTime:11});await tick();assert.equal(f.metadata.length,1);
 f.service.setMusicStatusOwnership(false);f.player.deliver({playing:false});await tick();assert.equal(f.clears(),1);
 f.service.setMusicStatusOwnership(true);await tick();assert.equal(f.clears(),2);
});

test('absolute sleep deadline is reconciled on return after background timers are delayed',async()=>{
 const f=fixture();await f.service.playMusicItem(radio());f.player.deliver({playing:true,isLoaded:true});await f.service.setMusicSleepTimer(1);
 await f.advance(61000);await f.foreground();assert.equal(f.service.getMusicPlaybackSnapshot().sleepUntil,null);assert.equal(f.active.at(-1),false);
});

test('warning duck restores the latest desired volume rather than an obsolete setting',async()=>{
 const f=fixture();await f.service.playMusicItem(radio());f.player.deliver({playing:true,isLoaded:true});f.service.duckMusicForWarning(900);assert.equal(f.player.volume,.2);
 await f.service.setMusicVolume(.4);assert.equal(f.player.volume,.1);await f.advance(901);assert.equal(f.player.volume,.4);
});

test('deleting active local audio removes owned file, queue, favorite and history',async()=>{
 const f=fixture({localTracks:[local()],favorites:[local()],history:[local()],queue:[local()],currentIndex:0});f.files.set(local().uri,{size:123});
 await f.service.playMusicItem(local());f.player.deliver({playing:true,isLoaded:true});await f.service.deleteLocalMusic('audio-a');
 const s=f.service.getMusicPlaybackSnapshot();assert.equal(s.localTracks.length,0);assert.equal(s.favorites.length,0);assert.equal(s.history.length,0);assert.equal(s.queue.length,0);assert.equal(f.files.has(local().uri),false);assert.equal(f.active.at(-1),false);
});

test('storage parser rejects malformed items, remote local paths, traversal and invalid values',()=>{
 const f=fixture();const parsed=f.library.parseMusicLibrary({queue:[radio(),radio(),{...local(),uri:'file:///outside/audio-a.mp3'},{...local(),uri:'file:///app/document/music/audio-%2e%2e%2fa.mp3'}],volume:Infinity,repeat:'bad',shareNowPlaying:'true',currentIndex:99});
 assert.equal(parsed.queue.length,1);assert.equal(parsed.volume,.8);assert.equal(parsed.repeat,'off');assert.equal(parsed.shareNowPlaying,false);assert.equal(parsed.currentIndex,0);
});

test('audio import copies selected files to app-private storage and leaves originals intact',async()=>{
 const f=fixture();f.pick([{uri:'content://picker/song.mp3',size:500}]);await f.service.importLocalMusic();const item=f.service.getMusicPlaybackSnapshot().localTracks[0];
 assert.match(item.uri,/^file:\/\/\/app\/document\/music\/audio-[a-z0-9-]+\.mp3$/);assert.equal(item.title,'song');assert.equal(f.files.has('content://picker/song.mp3'),true);assert.equal(f.files.has(item.uri),true);
});

test('invalid import rolls back copied files and never deletes picker originals',async()=>{
 const f=fixture();f.pick([{uri:'content://picker/song.mp3',size:500},{uri:'content://picker/not-audio.txt',size:20}]);await assert.rejects(f.service.importLocalMusic(),/Hỗ trợ MP3/);
 assert.equal([...f.files.keys()].filter(uri=>uri.startsWith('file:///app/document/music/')).length,0);assert.equal(f.files.has('content://picker/song.mp3'),true);
});

test('local-file removal refuses any URI outside the managed music directory',async()=>{
 const f=fixture();f.files.set('file:///outside/audio-a.mp3',{size:500});await f.library.removeMusicFile({...local(),uri:'file:///outside/audio-a.mp3'});assert.equal(f.files.has('file:///outside/audio-a.mp3'),true);
});

test('native decoder/network errors reach the shared UI without marking metadata as playing',async()=>{
 const f=fixture();await f.service.playMusicItem(radio());f.player.deliver({playing:false,isBuffering:true,error:'Decoder failed'});
 assert.match(f.service.getMusicPlaybackSnapshot().error,/Không phát được/);assert.equal(f.service.getMusicPlaybackSnapshot().playing,false);assert.equal(f.service.getMusicPlaybackSnapshot().buffering,false);
 await tick();await tick();assert.equal(f.active.at(-1),false);assert.equal(f.player.locks.at(-1),false);
});

test('local core does not clear remote metadata if ownership was handed off before initialization',async()=>{
 const f=fixture();f.service.setMusicStatusOwnership(false);await f.service.initializeMusicPlayback();assert.equal(f.clears(),0);
});

test('Android SAF numeric document ID imports using DISPLAY_NAME rather than URI basename',async()=>{
 const f=fixture();f.pick([{uri:'content://com.android.providers.downloads.documents/document/42',size:500,document:{name:'MyMap-QA.wav',mimeType:'audio/x-wav'}}]);await f.service.importLocalMusic();
 const item=f.service.getMusicPlaybackSnapshot().localTracks[0];assert.equal(item.title,'MyMap-QA');assert.match(item.uri,/\.wav$/);assert.equal(f.files.get(item.uri).size,500);
});

test('extensionless SAF document uses supported native MIME and File.type fallback',async()=>{
 const f=fixture();f.pick([{uri:'content://documents/42',size:500,document:{name:'Evening drive',mimeType:'audio/mpeg'}},{uri:'content://documents/43',size:500,type:'audio/wave'}]);await f.service.importLocalMusic();
 const tracks=f.service.getMusicPlaybackSnapshot().localTracks;assert.equal(tracks[0].title,'Evening drive');assert.match(tracks[0].uri,/\.mp3$/);assert.equal(tracks[1].title,'Nhạc đã nhập');assert.match(tracks[1].uri,/\.wav$/);
});

test('SAF rejects unsupported MIME for extensionless documents and rolls back earlier copies',async()=>{
 const f=fixture();f.pick([{uri:'content://documents/42',size:500,document:{name:'valid.wav',mimeType:'audio/wav'}},{uri:'content://documents/43',size:500,type:'application/pdf'}]);await assert.rejects(f.service.importLocalMusic(),/Hỗ trợ MP3/);
 assert.equal([...f.files.keys()].filter(uri=>uri.startsWith('file:///app/document/music/')).length,0);assert.equal(f.files.has('content://documents/42'),true);
});
