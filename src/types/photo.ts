export type PhotoPin = {
  id: number;
  uri: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: number;
  title: string | null;
  note: string | null;
  placeName: string | null;
  countryCode: string | null;
  timezoneOffsetMinutes?: number | null;
  tags?: string | null;
};
