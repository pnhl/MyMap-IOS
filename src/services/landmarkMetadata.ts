export type LandmarkMetadata={id:string;label:string;description:string;wikipediaUrl:string|null;wikidataUrl:string;fetchedAt:number};
const cache=new Map<string,LandmarkMetadata>();
export function parseLandmarkMetadata(payload:unknown,id:string):LandmarkMetadata{
 if(!/^Q[1-9]\d{0,14}$/.test(id))throw new Error('Mã Wikidata không hợp lệ.');
 const entity=(payload as any)?.entities?.[id];if(!entity||entity.id!==id||entity.type!=='item'||entity.missing!==undefined)throw new Error('Chưa tìm được thông tin địa danh.');
 const text=(field:any,max:number)=>typeof field?.vi?.value==='string'?field.vi.value.slice(0,max):typeof field?.en?.value==='string'?field.en.value.slice(0,max):'';
 let wikipediaUrl:string|null=null;const url=entity.sitelinks?.viwiki?.url||entity.sitelinks?.enwiki?.url;
 if(typeof url==='string'){try{const parsed=new URL(url);if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password&&['vi.wikipedia.org','en.wikipedia.org'].includes(parsed.hostname)&&parsed.pathname.startsWith('/wiki/'))wikipediaUrl=parsed.toString();}catch{}}
 return{id,label:text(entity.labels,300)||id,description:text(entity.descriptions,2000),wikipediaUrl,wikidataUrl:`https://www.wikidata.org/wiki/${id}`,fetchedAt:Date.now()};
}
export async function getLandmarkMetadata(id:string,signal?:AbortSignal){
 if(!/^Q[1-9]\d{0,14}$/.test(id))throw new Error('Mã Wikidata không hợp lệ.');if(signal?.aborted)throw new Error('Đã hủy tải địa danh.');const saved=cache.get(id);if(saved&&Date.now()-saved.fetchedAt<86400000)return saved;
 const controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,12000);signal?.addEventListener('abort',abort,{once:true});
 try{const response=await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${id}.json`,{signal:controller.signal,headers:{Accept:'application/json'}});if(!response.ok)throw new Error('Chưa tải được thông tin Wikidata.');const result=parseLandmarkMetadata(await response.json(),id);if(controller.signal.aborted)throw new Error('Đã hủy tải địa danh.');cache.set(id,result);if(cache.size>50)cache.delete(cache.keys().next().value!);return result;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
