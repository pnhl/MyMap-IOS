import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.1.3';
import {AccessToken,TrackSource} from 'npm:livekit-server-sdk@2.19.1';
import {createCallHandler} from './handler.ts';
const firebaseProject='mymap-a3ae4';
const jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
const handler=createCallHandler({
  verify:async token=>{const{payload}=await jwtVerify(token,jwks,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${firebaseProject}`,audience:firebaseProject});const firebase=payload.firebase as {sign_in_provider?:string}|undefined;if(!payload.sub||payload.sub.length>128||!firebase?.sign_in_provider||firebase.sign_in_provider==='anonymous')throw new Error('invalid_identity');},
  authorize:async(token,callId)=>{
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});
    const{data,error}=await client.rpc('mm_call_authorize',{p_call:callId});if(error||!data)throw new Error('not_allowed');return data;
  },
  issue:async grant=>{
    const url=Deno.env.get('LIVEKIT_URL'),key=Deno.env.get('LIVEKIT_API_KEY'),secret=Deno.env.get('LIVEKIT_API_SECRET');
    if(!url||!key||!secret)throw new Error('not_configured');
    const access=new AccessToken(key,secret,{identity:grant.identity,name:grant.name||'Thành viên MyMap',ttl:Math.max(1,Math.min(120,Math.floor((Date.parse(grant.expiresAt)-Date.now())/1000)))});
    access.addGrant({roomJoin:true,room:grant.room,canSubscribe:true,canPublish:true,canPublishData:false,canPublishSources:grant.mode==='video'?[TrackSource.MICROPHONE,TrackSource.CAMERA]:[TrackSource.MICROPHONE]});
    return{token:await access.toJwt(),url};
  },
});
Deno.serve(handler);
