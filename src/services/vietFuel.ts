import { env } from '../config/env';
import { explorerRequest } from './roadExplorer';
export type FuelPrice = { name: string; region1: number | null; region2: number | null; unit: string };
export type FuelPrices = { source: string; priceDate: string | null; stale: boolean; fetchedAt: number; rows: FuelPrice[] };
export function stationFuelSource(name: string): string | null {
  const normalized=name.toLowerCase().replace(/[^a-z0-9]/g,'');
  return ['petrolimex','pvoil','mipec','comeco','saigonpetro'].find(source=>normalized.includes(source)) || null;
}
export function parseVietFuel(data: any, now=Date.now()): FuelPrices {
  if (data?.success !== true || !Array.isArray(data.data)) throw new Error('VietFuel chưa có bảng giá hợp lệ.');
  const positive=(value: unknown)=>typeof value==='number' && Number.isFinite(value) && value>0 && value<=1000000 ? value : null;
  const rows:FuelPrice[]=data.data.flatMap((item: any)=>{
    if (typeof item.name!=='string' || !item.name.trim()) return [];
    const region1=positive(item.region1),region2=positive(item.region2);
    if (region1==null && region2==null) return [];
    return [{name:item.name.slice(0,100),region1,region2,unit:typeof item.unit==='string'?item.unit:'VND/lít'}];
  }).slice(0,25);
  if (!rows.length) throw new Error('VietFuel chưa có giá nhiên liệu.');
  const raw=String(data.meta?.priceDate||''), date=/^\d{4}-\d{2}-\d{2}$/.test(raw)?Date.parse(raw+'T00:00:00+07:00'):NaN;
  const valid=Number.isFinite(date) && date<=now+86400000 && new Date(raw+'T00:00:00Z').toISOString().slice(0,10)===raw;
  return {source:String(data.meta?.primarySource || data.meta?.source || 'VietFuel'),priceDate:valid?raw:null,stale:!valid || now-date>14*86400000,fetchedAt:now,rows};
}
export async function fetchVietFuel(stationName: string, signal?:AbortSignal, refresh=false):Promise<FuelPrices> {
  const base=env.vietFuelUrl.replace(/\/$/, '');
  if (!base.startsWith('https://')) throw new Error('Nguồn VietFuel cần kết nối HTTPS.');
  const source=stationFuelSource(stationName);
  return parseVietFuel(await explorerRequest(`${base}/api/fuel-prices${source?'/'+source:''}`,signal,undefined,refresh?0:900000));
}
