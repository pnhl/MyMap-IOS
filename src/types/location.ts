export type LocationPoint = {
  id?: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: number;
};

export type Visit = {
  id: string;
  latitude: number;
  longitude: number;
  arrivedAt: number;
  leftAt: number | null;
  durationMs: number;
  pointCount: number;
};
