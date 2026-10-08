import {isAvailableAsync,shareAsync} from 'expo-sharing';

export async function shareLocalFile(uri:string,title:string,mimeType='application/json') {
  if (!uri.startsWith('file://')) throw new Error('Chỉ chia sẻ tệp đã tạo trên thiết bị.');
  if (!await isAvailableAsync()) throw new Error('Thiết bị chưa hỗ trợ chia sẻ tệp.');
  await shareAsync(uri,{mimeType,dialogTitle:title,UTI:mimeType==='application/json'?'public.json':undefined});
}
