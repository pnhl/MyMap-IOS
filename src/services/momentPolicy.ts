import type {Moment} from '../types/moment';
export const MAX_MOMENT_BYTES=25*1024*1024;
export function validateMoment(m:Pick<Moment,'id'|'kind'|'caption'|'durationSeconds'|'recipients'|'latitude'|'longitude'>){
 if(!/^[a-f0-9-]{36}$/i.test(m.id))throw new Error('Khoảnh khắc không hợp lệ.');
 if(m.kind!=='photo'&&m.kind!=='video')throw new Error('Định dạng không được hỗ trợ.');
 if(m.caption.length>500)throw new Error('Ghi chú tối đa 500 ký tự.');
 if(!Number.isFinite(m.durationSeconds)||m.durationSeconds<0||m.durationSeconds>15)throw new Error('Video tối đa 15 giây.');
 if(m.recipients.length>30)throw new Error('Chọn tối đa 30 người nhận.');
 if((m.latitude===null)!==(m.longitude===null)||m.latitude!==null&&(!Number.isFinite(m.latitude)||Math.abs(m.latitude)>90)||m.longitude!==null&&(!Number.isFinite(m.longitude)||Math.abs(m.longitude)>180))throw new Error('Vị trí không hợp lệ.');
}
export function publishCoordinates(m:Pick<Moment,'shareLocation'|'latitude'|'longitude'>){return m.shareLocation?{lat:m.latitude,lon:m.longitude}:{lat:null,lon:null};}
export function sameCalendarDay(timestamp:number,date=new Date()){const d=new Date(timestamp);return d.getDate()===date.getDate()&&d.getMonth()===date.getMonth()&&d.getFullYear()<date.getFullYear();}
export function sameLocalDate(timestamp:number,date=new Date()){const d=new Date(timestamp);return d.getDate()===date.getDate()&&d.getMonth()===date.getMonth()&&d.getFullYear()===date.getFullYear();}
export function recapItems(items:Moment[]){
 const ordered=items.filter(m=>!m.remote&&!!m.uri).sort((a,b)=>a.capturedAt-b.capturedAt).slice(0,20);
 if(!ordered.length)throw new Error('Chọn ảnh hoặc video đã lưu trên máy.');
 return ordered.map(m=>({uri:m.uri,kind:m.kind,label:new Date(m.capturedAt).toLocaleString(),durationMs:m.kind==='photo'?3000:Math.min(10000,m.durationSeconds*1000)}));
}
