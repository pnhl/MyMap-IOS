import * as Crypto from 'expo-crypto';
import {getDb} from '../db/database';
import {getCurrentUser} from './auth';
import {accountApi} from './accountApi';
import type{CatalogDocument,CatalogKind}from'../types/catalog';
import {validateCatalogPayload} from '../utils/catalogRules';
const listeners=new Set<()=>void>();
let ready:Promise<void>|null=null,syncing:Promise<void>|null=null;
async function account(){return(await getCurrentUser())?.id||'local';}
async function database(){const db=await getDb();ready??=db.execAsync('CREATE TABLE IF NOT EXISTS catalog_documents(id TEXT NOT NULL,account TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(id,account));CREATE INDEX IF NOT EXISTS catalog_documents_account_kind ON catalog_documents(account,kind);CREATE TABLE IF NOT EXISTS catalog_deletions(id TEXT NOT NULL,account TEXT NOT NULL,error TEXT,PRIMARY KEY(id,account));').catch(e=>{ready=null;throw e;});await ready;return db;}
export function subscribeCatalog(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};}
function changed(){listeners.forEach(fn=>fn());}
export async function listDocuments<T=Record<string,unknown>>(kind?:CatalogKind):Promise<CatalogDocument<T>[]>{
 const db=await database(),owner=await account();const rows=await db.getAllAsync<{payload:string}>('SELECT d.payload FROM catalog_documents d WHERE d.account=?'+(kind?' AND d.kind=?':'')+' AND NOT EXISTS(SELECT 1 FROM catalog_deletions p WHERE p.id=d.id AND p.account=d.account)',...kind?[owner,kind]:[owner]);
 if(owner!==await account())throw new Error('Tài khoản đã thay đổi.');
 return rows.map(row=>{const doc=JSON.parse(row.payload)as CatalogDocument<T>;validateCatalogPayload(doc.kind,doc.data);return doc;}).filter(d=>d.kind!=='road_report'||d.expiresAt==null||d.expiresAt>Date.now()).sort((a,b)=>b.updatedAt-a.updatedAt);
}
async function persist(doc:CatalogDocument<unknown>){const db=await database();await db.runAsync('INSERT INTO catalog_documents(id,account,kind,payload) VALUES(?,?,?,?) ON CONFLICT(id,account) DO UPDATE SET kind=excluded.kind,payload=excluded.payload',doc.id,doc.account,doc.kind,JSON.stringify(doc));changed();}
export async function saveDocument<T>(kind:CatalogKind,data:T,existing?:CatalogDocument<T>,options:{members?:string[];share?:boolean;expiresAt?:number|null}={}):Promise<CatalogDocument<T>>{
 const owner=await account();if(existing&&existing.account!==owner)throw new Error('Dữ liệu thuộc tài khoản khác.');
 if(unescape(encodeURIComponent(JSON.stringify(data))).length>95000)throw new Error('Dữ liệu quá lớn.');
 validateCatalogPayload(kind,data);
 const db=await database();if(existing&&await db.getFirstAsync('SELECT id FROM catalog_deletions WHERE id=? AND account=?',existing.id,owner))throw new Error('Mục này đang chờ xóa.');
 const members=options.members??existing?.members??[];
 if(kind==='emergency_card'&&(options.share||members.length))throw new Error('Thẻ y tế chỉ lưu mã hóa trên thiết bị.');
 const doc:CatalogDocument<T>={id:existing?.id??Crypto.randomUUID(),account:owner,kind,data,members:[...new Set(members)],version:existing?.version??0,updatedAt:Math.max(Date.now(),(existing?.updatedAt||0)+1),expiresAt:options.expiresAt??existing?.expiresAt??null,sync:options.share||existing?.sync==='synced'||existing?.sync==='queued'||existing?.sync==='conflict'?'queued':'local',owned:existing?.owned??true};
 await persist(doc);return doc;
}
export async function pendingCatalogDeletes(){const db=await database(),owner=await account();const rows=await db.getAllAsync<{id:string;error:string|null}>('SELECT id,error FROM catalog_deletions WHERE account=?',owner);if(owner!==await account())throw new Error('Tài khoản đã thay đổi.');return rows;}
export async function removeDocument(doc:CatalogDocument<unknown>){if(doc.account!==await account())throw new Error('Tài khoản đã thay đổi.');if(doc.owned===false)throw new Error('Chỉ chủ sở hữu có thể xóa mục dùng chung.');const db=await database();if(doc.sync==='local')await db.runAsync('DELETE FROM catalog_documents WHERE id=? AND account=?',doc.id,doc.account);else await db.runAsync('INSERT INTO catalog_deletions(id,account) VALUES(?,?) ON CONFLICT(id,account) DO NOTHING',doc.id,doc.account);changed();}
async function flushDeletions(owner:string,attempted:Set<string>,api:Awaited<ReturnType<typeof accountApi>>){const db=await database();for(const row of await pendingCatalogDeletes()){if(owner!==await account())return;if(attempted.has(row.id))continue;attempted.add(row.id);try{const{error}=await api.client.rpc('mm_doc_delete',{p_id:row.id});if(error)throw error;if(owner!==await account())return;await db.runAsync('DELETE FROM catalog_documents WHERE id=? AND account=?',row.id,owner);await db.runAsync('DELETE FROM catalog_deletions WHERE id=? AND account=?',row.id,owner);changed();}catch(e){if(owner!==await account())return;await db.runAsync('UPDATE catalog_deletions SET error=? WHERE id=? AND account=?',String((e as{message?:string})?.message||e),row.id,owner);}}}
export async function syncCatalog(){if(syncing)return syncing;syncing=runSync().finally(()=>{syncing=null;});return syncing;}
async function runSync(){
 const user=await getCurrentUser();if(!user||user.is_anonymous)return;const api=await accountApi();if(api.owner!==user.id)throw Error('Tài khoản đã thay đổi.');
 const attempted=new Set<string>();await flushDeletions(user.id,attempted,api);
 const removed=await api.client.rpc('mm_doc_deletions');if(removed.error)throw removed.error;
 if(user.id!==await account())return;
 const db=await database();for(const id of removed.data||[]){await db.runAsync('DELETE FROM catalog_documents WHERE id=? AND account=?',String(id),user.id);await db.runAsync('DELETE FROM catalog_deletions WHERE id=? AND account=?',String(id),user.id);}
 if(removed.data?.length)changed();
 const docs=await listDocuments();
 for(const doc of docs.filter(d=>d.sync==='queued')){
  if(user.id!==await account())return;
  try{const{data,error}=await api.client.rpc('mm_doc_save',{p_id:doc.id,p_kind:doc.kind,p_payload:doc.data,p_version:doc.version,p_members:doc.members,p_expires:doc.expiresAt?new Date(doc.expiresAt).toISOString():null});if(error)throw error;
   if(user.id!==await account())return;
   // An edit made during an upload stays queued against the new server version.
   const current=(await listDocuments()).find(d=>d.id===doc.id);if(!current)continue;
   await persist({...current,version:Number(data),sync:current.updatedAt===doc.updatedAt?'synced':'queued',error:undefined});
  }catch(e){if(user.id!==await account())return;const message=e instanceof Error?e.message:String((e as{message?:string})?.message||e);const current=(await listDocuments()).find(d=>d.id===doc.id);if(current&&current.updatedAt===doc.updatedAt)await persist({...current,sync:/version_conflict/.test(message)?'conflict':'queued',error:message});}
 }
 await flushDeletions(user.id,attempted,api);
 if(user.id!==await account())return;
 const identity=await api.client.rpc('mm_identity');if(identity.error)throw identity.error;
 if(user.id!==await account())return;
 for(let offset=0;;offset+=200){
 const{data,error}=await api.client.from('mm_documents').select('*').or(`owner_id.eq.${identity.data},members.cs.{${identity.data}}`).order('updated_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+199);if(error)throw error;
 for(const remote of data||[]){if(user.id!==await account())return;if(await db.getFirstAsync('SELECT id FROM catalog_deletions WHERE id=? AND account=?',remote.id,user.id))continue;const local=(await listDocuments()).find(d=>d.id===remote.id);if(local&&local.sync!=='synced')continue;
  validateCatalogPayload(remote.kind,remote.payload);
  await persist({id:remote.id,account:user.id,kind:remote.kind,data:remote.payload,members:remote.members,version:remote.version,updatedAt:new Date(remote.updated_at).getTime(),expiresAt:remote.expires_at?new Date(remote.expires_at).getTime():null,sync:'synced',owned:remote.owner_id===identity.data});
 }
 if((data||[]).length<200)break;
 }
}
export async function acceptRemoteDocument(doc:CatalogDocument<unknown>){const api=await accountApi();if(api.owner!==doc.account)throw Error('Tài khoản đã thay đổi.');if(doc.account!==await account())throw new Error('Tài khoản đã thay đổi.');const{data,error}=await api.client.from('mm_documents').select('*').eq('id',doc.id).single();if(error)throw error;if(doc.account!==await account())throw new Error('Tài khoản đã thay đổi.');validateCatalogPayload(data.kind,data.payload);const db=await database();if(await db.getFirstAsync('SELECT id FROM catalog_deletions WHERE id=? AND account=?',doc.id,doc.account))throw new Error('Mục này đang chờ xóa.');await persist({...doc,data:data.payload,version:data.version,members:data.members,sync:'synced',error:undefined,updatedAt:new Date(data.updated_at).getTime()});}
