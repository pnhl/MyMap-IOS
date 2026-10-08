import {accountApi} from './accountApi';
import {uuid} from './socialTools';
import {validateCatalogPayload} from '../utils/catalogRules';
import type {MeetupEvent,PlaceReview} from '../types/catalog';
export type SharedContent={id:string;kind:'event'|'review';payload:MeetupEvent|PlaceReview;updated_at:string};
export async function readSharedContent(id:string):Promise<SharedContent>{
 const api=await accountApi();const{data,error}=await api.client.from('mm_documents').select('id,kind,payload,updated_at').eq('id',uuid(id)).in('kind',['event','review']).maybeSingle();await api.assertCurrent();
 if(error||!data)throw Error('Nội dung đã bị gỡ hoặc bạn không còn quyền truy cập.');
 validateCatalogPayload(data.kind,data.payload);return data as SharedContent;
}
