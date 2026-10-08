import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import {Linking} from 'react-native';

const clientId=process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID?.trim() || '';
const redirectUri=process.env.EXPO_PUBLIC_SPOTIFY_REDIRECT_URI?.trim() || '';
const appReturnUri='mymap://spotify';
const SESSION='mymap.spotify.session.v1';
type Session={access_token:string;refresh_token:string;expires_at:number};
export type SpotifyAccount={id:string;display_name:string|null;external_urls:{spotify:string};product?:string};
export type SpotifyTrack={id:string;name:string;artists:{name:string}[];album:{images:{url:string}[]};external_urls:{spotify:string};uri:string};
export const spotifyConfigured=Boolean(clientId&&redirectUri.startsWith('https://'));
const secureOptions={keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY};
async function store(session:Session){await SecureStore.setItemAsync(SESSION,JSON.stringify(session),secureOptions);}
export class SpotifyHttpError extends Error {
 constructor(public readonly status:number,message:string){super(message);this.name='SpotifyHttpError';}
}
async function spotifyHttpError(response:Response,stage:'token'|'profile'|'api'):Promise<SpotifyHttpError>{
 let reason='';
 try{const body=await response.json();reason=typeof body?.error?.message==='string'?body.error.message:typeof body?.error_description==='string'?body.error_description:'';}catch{/* Spotify can also return a plain-text error. */}
 if(response.status===403){
  if(/insufficient.*scope|scope.*insufficient/i.test(reason))return new SpotifyHttpError(403,'Spotify chưa cấp đủ quyền truy cập (403). Hãy hủy liên kết rồi liên kết lại và chấp nhận các quyền được yêu cầu.');
  return new SpotifyHttpError(403,`${stage==='profile'?'Đăng nhập đã xong nhưng Spotify chưa cho MyMap đọc tài khoản':'Spotify từ chối quyền truy cập'} (403). Nếu ứng dụng Spotify ở chế độ Development, nhà phát triển cần thêm đúng email Spotify vào Dashboard → Settings → Users Management và kiểm tra tài khoản chủ ứng dụng còn Premium. Sau đó hãy liên kết lại.`);
 }
 if(response.status===429)return new SpotifyHttpError(429,'Spotify đang giới hạn truy vấn (429). Vui lòng thử lại sau.');
 if(response.status>=500)return new SpotifyHttpError(response.status,`Spotify tạm thời không phản hồi (${response.status}). Vui lòng thử lại sau.`);
 if(stage==='token')return new SpotifyHttpError(response.status,`Spotify chưa đổi được mã đăng nhập (${response.status}). Hãy liên kết lại; nhà phát triển cần kiểm tra Client ID và Redirect URI trùng khớp cấu hình Dashboard.`);
 return new SpotifyHttpError(response.status,`Spotify chưa cho phép thao tác này (${response.status}). Vui lòng thử lại hoặc liên kết lại tài khoản.`);
}
async function tokenRequest(body:Record<string,string>){
 const response=await fetch('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body).toString()});
 if(!response.ok)throw await spotifyHttpError(response,'token');
 return response.json();
}
export async function connectSpotify():Promise<SpotifyAccount>{
 if(!spotifyConfigured)throw new Error('Nhà phát triển cần cấu hình Spotify Client ID và HTTPS Redirect URI để liên kết tài khoản.');
 const verifier=Array.from(Crypto.getRandomBytes(48),b=>b.toString(16).padStart(2,'0')).join('');
 const state=Array.from(Crypto.getRandomBytes(24),b=>b.toString(16).padStart(2,'0')).join('');
 const digest=await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,verifier);
 const challenge=btoa(String.fromCharCode(...(digest.match(/.{2}/g)||[]).map(h=>parseInt(h,16)))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 const params=new URLSearchParams({client_id:clientId,response_type:'code',redirect_uri:redirectUri,code_challenge_method:'S256',code_challenge:challenge,state,scope:'user-read-private user-read-currently-playing',show_dialog:'true'});
 // The registered HTTPS callback relays only code/state to our app scheme.
 // Never exchange tokens on the hosting server or embed a client secret.
 const result=await WebBrowser.openAuthSessionAsync(`https://accounts.spotify.com/authorize?${params}`,appReturnUri);
 if(result.type!=='success')throw new Error('Bạn chưa hoàn tất liên kết Spotify.');
 const callback=new URL(result.url);
 if(callback.protocol!=='mymap:'||callback.hostname!=='spotify'||callback.pathname!==''||callback.searchParams.get('state')!==state)throw new Error('Callback Spotify không hợp lệ.');
 const code=callback.searchParams.get('code');if(!code)throw new Error('Bạn đã từ chối liên kết Spotify.');
 const token=await tokenRequest({client_id:clientId,grant_type:'authorization_code',code,redirect_uri:redirectUri,code_verifier:verifier});
 // OAuth approval does not imply Web API access for Development Mode users.
 // Confirm the profile first so a denied account never becomes a saved link.
 const account:SpotifyAccount=await api('me',token.access_token);
 await store({...token,expires_at:Date.now()+token.expires_in*1000});
 return account;
}
let refresh:Promise<Session>|null=null;
async function session():Promise<Session>{
 const raw=await SecureStore.getItemAsync(SESSION);if(!raw)throw new Error('Liên kết tài khoản Spotify trước khi tìm nhạc.');
 const s:Session=JSON.parse(raw);if(s.expires_at>Date.now()+60000)return s;
 if(!refresh)refresh=(async()=>{try{const token=await tokenRequest({client_id:clientId,grant_type:'refresh_token',refresh_token:s.refresh_token});const next={...token,refresh_token:token.refresh_token||s.refresh_token,expires_at:Date.now()+token.expires_in*1000};await store(next);return next;}finally{refresh=null;}})();
 return refresh;
}
async function api(path:string,pendingAccessToken?:string){
 const accessToken=pendingAccessToken||(await session()).access_token;
 const response=await fetch(`https://api.spotify.com/v1/${path}`,{headers:{Authorization:`Bearer ${accessToken}`}});
 if(response.status===204)return null;
 if(response.status===401){if(!pendingAccessToken)await disconnectSpotify();throw new SpotifyHttpError(401,'Phiên Spotify đã hết hiệu lực (401). Hãy liên kết lại.');}
 if(!response.ok)throw await spotifyHttpError(response,path==='me'?'profile':'api');
 return response.json();
}
export async function spotifyAccount():Promise<SpotifyAccount>{return api('me');}
export async function searchSpotify(query:string):Promise<SpotifyTrack[]>{if(!query.trim())return [];const data=await api(`search?${new URLSearchParams({q:query.trim(),type:'track',limit:'10'})}`);return data?.tracks?.items||[];}
export async function currentlyPlayingSpotify(){return api('me/player/currently-playing');}
export async function disconnectSpotify(){await SecureStore.deleteItemAsync(SESSION);}
export async function openSpotifyTrack(track:SpotifyTrack){
 const uri=`spotify:track:${track.id}`;
 if(await Linking.canOpenURL(uri))await Linking.openURL(uri);else await Linking.openURL(track.external_urls.spotify);
}
