export type CrowdDensity = 'moderate' | 'busy' | 'very_busy';

export interface CrowdCell {
  cell_key: string;
  center_lat: number;
  center_lon: number;
  density_level: CrowdDensity;
  updated_at: string;
}

export interface TrustedContact { id: string; name: string; phone_e164: string | null; }
export interface SosResult { ok: boolean; event_id: string; emergency_number: string | null; dial_requires_user_confirmation: true; contacts: TrustedContact[]; suggested_message: string; location_url: string | null; }
