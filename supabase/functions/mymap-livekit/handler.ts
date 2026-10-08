export type CallGrant = {identity:string;name:string;room:string;callId:string;chatRoom:string;mode:'voice'|'video'|'ptt';expiresAt:string;canEnd?:boolean};
type Dependencies = {
  verify:(token:string)=>Promise<void>;
  authorize:(token:string,callId:string)=>Promise<CallGrant>;
  issue:(grant:CallGrant)=>Promise<{token:string;url:string}>;
};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function response(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
export function createCallHandler(deps:Dependencies){return async(req:Request):Promise<Response>=>{
  if(req.method!=='POST')return response(405,{error:'method_not_allowed'});
  const authorization=req.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer ')||authorization.length>16384)return response(401,{error:'authentication_required'});
  const token=authorization.slice(7);
  try{await deps.verify(token);}catch{return response(401,{error:'invalid_session'});}
  let callId:string;
  try{if(Number(req.headers.get('Content-Length'))>4096)return response(413,{error:'request_too_large'});const text=await req.text();if(text.length>4096)return response(413,{error:'request_too_large'});const body=JSON.parse(text);if(!uuid.test(body?.callId))return response(400,{error:'invalid_call'});callId=body.callId;}catch{return response(400,{error:'invalid_request'});}
  let grant:CallGrant;
  try{grant=await deps.authorize(token,callId);}catch{return response(403,{error:'call_not_allowed'});}
  if(!uuid.test(grant.identity)||!uuid.test(grant.chatRoom)||grant.callId!==callId||grant.room!==`mymap-call-${callId}`||!['voice','video','ptt'].includes(grant.mode)||!Number.isFinite(Date.parse(grant.expiresAt))||Date.parse(grant.expiresAt)<=Date.now())return response(403,{error:'invalid_grant'});
  try{
    const result=await deps.issue(grant);
    if(!result.url.startsWith('wss://')||!result.token)return response(503,{error:'calls_not_configured'});
    return response(200,{...result,mode:grant.mode,callId,chatRoom:grant.chatRoom,expiresAt:grant.expiresAt,canEnd:grant.canEnd===true});
  }catch{return response(503,{error:'calls_unavailable'});}
};}
