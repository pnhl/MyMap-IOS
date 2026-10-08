import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
import {RoomServiceClient} from 'npm:livekit-server-sdk@2.19.1';
// This endpoint accepts the project's existing anon API key, but has no caller-supplied
// room/participant/action. It can only execute expired or revoked jobs selected by SQL.
// A server-side lease prevents callers from increasing the cleanup rate.
Deno.serve(async(req:Request)=>{
 const reply=(status:number)=>new Response(JSON.stringify({ok:status===200}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method!=='POST')return reply(405);
 const anon=Deno.env.get('SUPABASE_ANON_KEY');
 // Runtime default anon keys can differ from the project's published scheduler key.
 // Pin the public scheduler key's fingerprint as well; no private credential is embedded.
 const pinnedDigest=Deno.env.get('MYMAP_SCHEDULER_KEY_SHA256')||'433b90458fddfe89483e30ac66dbf618802f1fdfb1680814a3f92fa564fb6666';
 const presented=req.headers.get('Authorization')?.replace(/^Bearer /,'')||req.headers.get('apikey')||'';
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(presented)))).map(b=>b.toString(16).padStart(2,'0')).join('');
 if(!presented||(!anon||presented!==anon)&&hash!==pinnedDigest)return reply(401);
 try{
  const key=Deno.env.get('LIVEKIT_API_KEY'),secret=Deno.env.get('LIVEKIT_API_SECRET'),url=Deno.env.get('LIVEKIT_URL');
  if(!key||!secret||!url)return reply(503);
  const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data,error}=await server.rpc('mm_call_cleanup_jobs');if(error)throw error;
  const rooms=new RoomServiceClient(url.replace(/^wss:/,'https:'),key,secret);
  for(const id of data||[]){
   if(typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id))continue;
   try{await rooms.deleteRoom('mymap-call-'+id);}catch(e){if((e as {code?:string}).code!=='not_found')continue;}
   await server.rpc('mm_call_cleanup_done',{p_call:id});
  }
  return reply(200);
 }catch{return reply(503);}
});
