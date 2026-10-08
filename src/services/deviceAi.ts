import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import Native from '../../modules/my-map-capabilities';
import {extensionSnapshot,initializeExtensions} from './extensionPreferences';
import {aiPrompt,validGgufHeader,MAX_AI_MODEL_BYTES,type AiTask} from '../utils/aiRules';
import type {LlamaContext} from 'llama.rn';
import {DEFAULT_AI_MODEL} from '../utils/aiModels';
type Model={uri:string;name:string;bytes:number};
const KEY='mymap.ai-model.v1',directory=FileSystem.documentDirectory+'mymap/ai/';
let context:LlamaContext|null=null,busy=false,generation=0,download:ReturnType<typeof FileSystem.createDownloadResumable>|null=null;
async function enabled(){await initializeExtensions();if(!extensionSnapshot().deviceAi)throw Error('Bật AI trên thiết bị trong Cài đặt trước.');}
export async function deviceAiHardware(){if(!Native?.aiHardware)throw Error('Cần bản ứng dụng native mới để dùng AI.');return Native.aiHardware();}
export async function getAiModel():Promise<Model|null>{const raw=await AsyncStorage.getItem(KEY);if(!raw)return null;try{const model=JSON.parse(raw)as Model;if(!model.uri?.startsWith(directory)||!/^model-[a-f0-9-]+\.gguf$/.test(model.uri.slice(directory.length)))return null;const info=await FileSystem.getInfoAsync(model.uri);return info.exists&&info.size===model.bytes?model:null;}catch{return null;}}
export async function importAiModel(asset:{uri:string;name:string;size?:number}){
 await enabled();if(busy)throw Error('AI đang xử lý.');const hardware=await deviceAiHardware();if(!hardware.local64Bit)throw Error('AI cục bộ cần ứng dụng và thiết bị 64 bit.');
 if(!/\.gguf$/i.test(asset.name)||!asset.size||asset.size<8||asset.size>MAX_AI_MODEL_BYTES)throw Error('Chọn tệp GGUF dưới 750 MB có thông tin kích thước.');
 if(await FileSystem.getFreeDiskStorageAsync()<asset.size+100*1024*1024)throw Error('Chưa đủ dung lượng trống để nhập mô hình.');
 busy=true;const token=generation,to=directory+'model-'+Crypto.randomUUID()+'.gguf';
 try{await FileSystem.makeDirectoryAsync(directory,{intermediates:true});await FileSystem.copyAsync({from:asset.uri,to});const info=await FileSystem.getInfoAsync(to);if(!info.exists||info.size!==asset.size)throw Error('Tệp mô hình chưa được sao chép đầy đủ.');const header=await FileSystem.readAsStringAsync(to,{encoding:FileSystem.EncodingType.Base64,position:0,length:8});if(!validGgufHeader(header))throw Error('Tệp không có định dạng GGUF hợp lệ.');if(token!==generation)throw Error('Đã hủy nhập mô hình.');const previous=await getAiModel();if(token!==generation)throw Error('Đã hủy nhập mô hình.');const model:Model={uri:to,name:asset.name.slice(0,120),bytes:asset.size};await AsyncStorage.setItem(KEY,JSON.stringify(model));if(previous)await FileSystem.deleteAsync(previous.uri,{idempotent:true}).catch(()=>{});return model;}
 catch(e){await FileSystem.deleteAsync(to,{idempotent:true}).catch(()=>{});throw e;}finally{busy=false;}
}
export async function removeAiModel(){if(busy)throw Error('Dừng xử lý AI trước khi xóa mô hình.');const model=await getAiModel();await AsyncStorage.removeItem(KEY);if(model)await FileSystem.deleteAsync(model.uri,{idempotent:true});}
export async function systemAiStatus(){await enabled();const result=await Native?.systemAi?.('status','');return typeof result==='object'?result.status:'unavailable';}
export async function prepareSystemAi(){await enabled();return Native?.systemAi?.('status','');}
export async function downloadDefaultAiModel(onProgress?:(fraction:number)=>void){
 await enabled();if(busy)throw Error('AI đang xử lý.');if(!Native?.hashAiModel)throw Error('Cần bản iOS mới để tải mô hình.');
 const hardware=await deviceAiHardware();if(!hardware.local64Bit)throw Error('AI cục bộ cần thiết bị và ứng dụng 64 bit.');
 if(await FileSystem.getFreeDiskStorageAsync()<DEFAULT_AI_MODEL.bytes+100*1024*1024)throw Error('Cần ít nhất 600 MB dung lượng trống để tải mô hình.');
 busy=true;const token=generation,to=directory+'model-'+Crypto.randomUUID()+'.gguf';let stored=false;
 const timer=setTimeout(()=>{void stopDeviceAi();},600000);
 try{
  await FileSystem.makeDirectoryAsync(directory,{intermediates:true});if(token!==generation)throw Error('Đã dừng tải mô hình.');
  download=FileSystem.createDownloadResumable(DEFAULT_AI_MODEL.url,to,{},progress=>{if(token===generation)onProgress?.(Math.min(1,progress.totalBytesWritten/DEFAULT_AI_MODEL.bytes));});
  const result=await download.downloadAsync();if(token!==generation||result?.status!==200)throw Error('Chưa tải xong mô hình. Hãy thử lại.');
  const info=await FileSystem.getInfoAsync(to);if(!info.exists||info.size!==DEFAULT_AI_MODEL.bytes)throw Error('Mô hình chưa được tải đầy đủ.');
  if(await Native.hashAiModel(to)!==DEFAULT_AI_MODEL.sha256)throw Error('Tệp mô hình không đúng mã kiểm tra. Hãy tải lại.');
  const previous=await getAiModel();if(token!==generation)throw Error('Đã dừng tải mô hình.');
  const model:Model={uri:to,name:DEFAULT_AI_MODEL.name,bytes:DEFAULT_AI_MODEL.bytes};await AsyncStorage.setItem(KEY,JSON.stringify(model));stored=true;
  if(previous)await FileSystem.deleteAsync(previous.uri,{idempotent:true}).catch(()=>{});return model;
 }finally{clearTimeout(timer);download=null;busy=false;if(!stored)await FileSystem.deleteAsync(to,{idempotent:true}).catch(()=>{});}
}
export async function stopDeviceAi(){generation++;await Promise.allSettled([Native?.stopAi?.(),context?.stopCompletion(),download?.cancelAsync()]);}
export async function generateDeviceAi(provider:'system'|'local',task:AiTask,input:string,onText?:(text:string)=>void){
 await enabled();if(busy)throw Error('AI đang xử lý.');const prompt=aiPrompt(task,input),token=generation;busy=true;
 try{
  if(provider==='system'){const result=await Native?.systemAi?.('generate',prompt);if(token!==generation)throw Error('Đã dừng AI.');if(typeof result!=='string'||!result.trim())throw Error('Apple Intelligence chưa trả lời được.');return result;}
  const model=await getAiModel();if(!model)throw Error('Chọn mô hình GGUF trước.');const hardware=await deviceAiHardware();if(!hardware.local64Bit)throw Error('AI cục bộ cần thiết bị 64 bit.');if(hardware.availableBytes<model.bytes*1.7+256*1024*1024)throw Error('Thiếu RAM cho mô hình này. Đóng ứng dụng khác hoặc chọn mô hình nhỏ hơn.');
  const llama=await import('llama.rn');if(token!==generation)throw Error('Đã dừng AI.');context=await llama.initLlama({model:model.uri,n_ctx:2048,n_batch:128,n_threads:2,n_gpu_layers:0,use_mlock:false});if(token!==generation)throw Error('Đã dừng AI.');
  const tokens=await context.tokenize(prompt);if(tokens.tokens.length>1536)throw Error('Nội dung quá dài cho mô hình cục bộ. Rút ngắn ghi chú rồi thử lại.');if(token!==generation)throw Error('Đã dừng AI.');
  let text='';const timer=setTimeout(()=>{void stopDeviceAi();},60000);
  try{const result=await context.completion({messages:[{role:'user',content:prompt}],n_predict:384,temperature:.3,stop:['</s>','<|im_end|>','<|eot_id|>','<|end_of_turn|>']},chunk=>{if(token===generation){text+=chunk.token;onText?.(text.slice(0,10000));}});if(token!==generation)throw Error('Đã dừng AI hoặc hết thời gian xử lý.');if(!result.text.trim())throw Error('Mô hình không trả lời được. Kiểm tra tệp instruct tương thích.');return result.text.slice(0,10000);}
  finally{clearTimeout(timer);}
 }finally{const loaded=context;context=null;if(loaded)await loaded.release().catch(()=>{});busy=false;}
}
