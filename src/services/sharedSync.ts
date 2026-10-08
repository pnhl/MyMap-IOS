import {AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {requireOptionalNativeModule} from 'expo';
import * as TaskManager from 'expo-task-manager';
import {getCurrentUser,subscribeAuthState} from './auth';
import {syncCatalog,listDocuments,pendingCatalogDeletes} from './catalogStore';
import {flushChat,pendingChat} from './privateChat';
import {flushLocalProfile,profileNeedsSync} from './localProfile';
import {syncMomentQueue,listLocalMoments} from './moments';
const TASK='mymap-shared-sync-v1',KEY='mymap.background-sync.v1',STATUS='mymap.shared-sync.status.v1';
const available=!!requireOptionalNativeModule('ExpoBackgroundTask');
let running:Promise<boolean>|null=null;
let settings:Promise<unknown>=Promise.resolve();
export function runSharedSync(){if(running)return running;running=run().finally(()=>{running=null;});return running;}
async function run(){
 const user=await getCurrentUser();if(!user||user.is_anonymous)return true;
 const results=await Promise.allSettled([syncCatalog(),flushChat(),syncMomentQueue(),flushLocalProfile()]);
 if(user.id!==(await getCurrentUser())?.id)return false;
 const deletes=await pendingCatalogDeletes(),docs=await listDocuments(),chat=await pendingChat(),moments=await listLocalMoments();
 const failed=(await profileNeedsSync())||results.some(r=>r.status==='rejected')||deletes.length>0||docs.some(d=>d.sync==='queued'||d.sync==='conflict')||chat.length>0||moments.some(m=>m.status==='queued'||m.status==='failed');
 await AsyncStorage.setItem(STATUS,JSON.stringify({at:Date.now(),failed,account:user.id}));return !failed;
}
if(!TaskManager.isTaskDefined(TASK))TaskManager.defineTask(TASK,async()=>{
 if(!available)return;
 const background=await import('expo-background-task');
 try{if(await AsyncStorage.getItem(KEY)!=='true')return background.BackgroundTaskResult.Success;return await runSharedSync()?background.BackgroundTaskResult.Success:background.BackgroundTaskResult.Failed;}
 catch{return background.BackgroundTaskResult.Failed;}
});
export async function syncSettings(){const raw=JSON.parse(await AsyncStorage.getItem(STATUS)||'null'),user=await getCurrentUser();return {available,enabled:await AsyncStorage.getItem(KEY)==='true',last:raw?.account===user?.id?raw:null};}
export function setBackgroundSync(enabled:boolean){const work=settings.catch(()=>{}).then(async()=>{if(!available)throw new Error('Cần bản native mới để đăng ký đồng bộ nền.');const background=await import('expo-background-task');if(enabled){if(await background.getStatusAsync()===background.BackgroundTaskStatus.Restricted)throw new Error('Hệ điều hành đang hạn chế tác vụ nền.');await background.registerTaskAsync(TASK,{minimumInterval:15});}else await background.unregisterTaskAsync(TASK);await AsyncStorage.setItem(KEY,String(enabled));});settings=work;return work;}
export function startSharedSync(){
 let active=true;const refresh=()=>{if(active&&AppState.currentState==='active')void runSharedSync().catch(()=>{});};
 const auth=subscribeAuthState(refresh),subscription=AppState.addEventListener('change',state=>{if(state==='active')refresh();});const timer=setInterval(refresh,60000);
 void syncSettings().then(s=>{if(s.available&&s.enabled)return setBackgroundSync(true);}).catch(()=>{});refresh();
 return()=>{active=false;auth();subscription.remove();clearInterval(timer);};
}
