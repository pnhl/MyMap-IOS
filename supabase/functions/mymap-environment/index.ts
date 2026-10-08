import {createClient} from 'npm:@supabase/supabase-js@2.95.0';
import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.1.3';
import {createEnvironmentHandler} from './handler.ts';
const project='mymap-a3ae4',jwks=createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));
Deno.serve(createEnvironmentHandler({
 key:Deno.env.get('OPEN_METEO_API_KEY'),noncommercial:Deno.env.get('OPEN_METEO_NONCOMMERCIAL')==='true',
 verify:async token=>{const{payload}=await jwtVerify(token,jwks,{algorithms:['RS256'],issuer:`https://securetoken.google.com/${project}`,audience:project});const firebase=payload.firebase as{sign_in_provider?:string}|undefined;if(!payload.sub||payload.sub.length>128||!firebase?.sign_in_provider||firebase.sign_in_provider==='anonymous')throw Error('invalid_identity');},
 authorize:async token=>{const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false}});const{error}=await client.rpc('mm_environment_access');if(error)throw Error('rate_limited');},
}));
