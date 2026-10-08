type Dependencies={verify:(token:string)=>Promise<void>;authorize:(token:string)=>Promise<void>;key?:string;noncommercial?:boolean;fetcher?:typeof fetch};
const CACHE_MS=15*60*1000;
export function createEnvironmentHandler(deps:Dependencies){
 const cache=new Map<string,{at:number;data:unknown}>(),pending=new Map<string,Promise<unknown>>();
 const out=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 return async(req:Request)=>{
  if(req.method!=='POST')return out(405,{error:'method_not_allowed'});
  const bearer=req.headers.get('Authorization')||'';if(!bearer.startsWith('Bearer ')||bearer.length>16384)return out(401,{error:'authentication_required'});
  const token=bearer.slice(7);try{await deps.verify(token);await deps.authorize(token);}catch{return out(401,{error:'invalid_session_or_rate_limit'});}
  let latitude:number,longitude:number,kind:string;
  try{if(Number(req.headers.get('content-length'))>1024)return out(413,{error:'request_too_large'});const text=await req.text();if(text.length>1024)return out(413,{error:'request_too_large'});const body=JSON.parse(text);latitude=body.latitude;longitude=body.longitude;kind=body.kind;if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude< -90||latitude>90||longitude< -180||longitude>180||!['air','weather'].includes(kind))return out(400,{error:'invalid_coordinates_or_kind'});}catch{return out(400,{error:'invalid_request'});}
  if(!deps.key&&!deps.noncommercial)return out(503,{error:'provider_license_not_configured'});
  latitude=Math.round(latitude*100)/100;longitude=Math.round(longitude*100)/100;
  const id=`${kind}:${latitude}:${longitude}`,hit=cache.get(id);if(hit&&Date.now()-hit.at<CACHE_MS)return out(200,hit.data);
  let work=pending.get(id);
  if(!work){work=(async()=>{
    const url=new URL(kind==='air'?`https://${deps.key?'customer-':''}air-quality-api.open-meteo.com/v1/air-quality`:`https://${deps.key?'customer-':''}api.open-meteo.com/v1/forecast`);
    const fields=kind==='air'?'us_aqi,european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone':'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m';
    url.searchParams.set('latitude',String(latitude));url.searchParams.set('longitude',String(longitude));url.searchParams.set('current',fields);url.searchParams.set('hourly',fields);url.searchParams.set('timezone','GMT');url.searchParams.set('timeformat','unixtime');url.searchParams.set('forecast_days','3');if(deps.key)url.searchParams.set('apikey',deps.key);
    const response=await(deps.fetcher||fetch)(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('provider_failed');const data=await response.json();if(!data?.current)throw Error('provider_payload');const value={...data,provider:'Open-Meteo',kind:'forecast',fetched_at:new Date().toISOString()};
    if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(id,{at:Date.now(),data:value});return value;
   })().finally(()=>pending.delete(id));pending.set(id,work);}
  try{return out(200,await work);}catch{return out(502,{error:'environment_provider_unavailable'});}
 };
}
