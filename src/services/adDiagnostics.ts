export type AdDiagnostic = {state:'initializing'|'blocked'|'ready'|'loading'|'loaded'|'unavailable'|'error'|'missing'; message:string; updatedAt:number};
let snapshot:Readonly<Record<string,AdDiagnostic>>=Object.freeze({});
const listeners=new Set<()=>void>();
export const getAdDiagnostics=()=>snapshot;
export function subscribeAdDiagnostics(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function recordAdDiagnostic(key:string,state:AdDiagnostic['state'],message:string){
  snapshot=Object.freeze({...snapshot,[key]:{state,message,updatedAt:Date.now()}});
  listeners.forEach(listener=>listener());
}
