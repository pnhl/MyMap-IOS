export const AIR_FIELDS=['us_aqi','european_aqi','pm2_5','pm10','carbon_monoxide','nitrogen_dioxide','sulphur_dioxide','ozone'] as const;
export type AirField=typeof AIR_FIELDS[number];
export type AirReading={at:number;values:Partial<Record<AirField,number>>};
export type AirQuality={fetchedAt:number;current:AirReading;hourly:AirReading[];units:Partial<Record<AirField,string>>;provider:'Open-Meteo · CAMS';kind:'forecast'};
function values(raw:Record<string,unknown>){const result:AirReading['values']={};for(const field of AIR_FIELDS){const value=raw[field];if(typeof value==='number'&&Number.isFinite(value)&&value>=0)result[field]=value;}return result;}
export function parseAirQuality(raw:unknown,now=Date.now()):AirQuality{
 const data=raw as {current?:Record<string,unknown>;current_units?:Record<string,unknown>;hourly?:Record<string,unknown>;fetched_at?:string};
 const at=data?.current?.time;if(typeof at!=='number'||!Number.isFinite(at)||at<0)throw Error('Dữ liệu không khí chưa có thời gian hợp lệ.');
 const current:AirReading={at:at*1000,values:values(data.current!)};if(!Object.keys(current.values).length)throw Error('Nhà cung cấp chưa có dữ liệu không khí cho vị trí này.');
 const units:AirQuality['units']={};for(const field of AIR_FIELDS){const value=data.current_units?.[field];if(typeof value==='string'&&value.length<=20)units[field]=value;}
 const hourly:AirReading[]=[],times=data.hourly?.time;
 if(Array.isArray(times))for(let i=0;i<Math.min(times.length,120);i++){const time=times[i];if(typeof time!=='number'||!Number.isFinite(time)||time*1000<now-3600000)continue;const row:Record<string,unknown>={};for(const field of AIR_FIELDS){const list=data.hourly?.[field];if(Array.isArray(list))row[field]=list[i];}const result=values(row);if(Object.keys(result).length)hourly.push({at:time*1000,values:result});}
 const fetched=Date.parse(data.fetched_at||'');return {fetchedAt:Number.isFinite(fetched)?fetched:now,current,hourly,units,provider:'Open-Meteo · CAMS',kind:'forecast'};
}
export function aqiColor(usAqi?:number){if(usAqi==null)return '#98a4b4';if(usAqi<=50)return '#37a874';if(usAqi<=100)return '#d0a31b';if(usAqi<=150)return '#e18132';if(usAqi<=200)return '#dc4b60';if(usAqi<=300)return '#9672ce';return '#913954';}
