// Launch market: Dallas–Fort Worth. Plans and vendors pick a city from this
// list; distance is measured city-center to city-center.

export interface City {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

export const CITIES: City[] = [
  { id: "dallas", name: "Dallas", lat: 32.7767, lng: -96.797 },
  { id: "fort-worth", name: "Fort Worth", lat: 32.7555, lng: -97.3308 },
  { id: "arlington", name: "Arlington", lat: 32.7357, lng: -97.1081 },
  { id: "plano", name: "Plano", lat: 33.0198, lng: -96.6989 },
  { id: "frisco", name: "Frisco", lat: 33.1507, lng: -96.8236 },
  { id: "mckinney", name: "McKinney", lat: 33.1972, lng: -96.6398 },
  { id: "allen", name: "Allen", lat: 33.1032, lng: -96.6706 },
  { id: "richardson", name: "Richardson", lat: 32.9483, lng: -96.7299 },
  { id: "irving", name: "Irving", lat: 32.814, lng: -96.9489 },
  { id: "garland", name: "Garland", lat: 32.9126, lng: -96.6389 },
  { id: "carrollton", name: "Carrollton", lat: 32.9756, lng: -96.89 },
  { id: "lewisville", name: "Lewisville", lat: 33.0462, lng: -96.9942 },
  { id: "denton", name: "Denton", lat: 33.2148, lng: -97.1331 },
  { id: "grapevine", name: "Grapevine", lat: 32.9343, lng: -97.0781 },
  { id: "southlake", name: "Southlake", lat: 32.9412, lng: -97.1342 },
  { id: "rockwall", name: "Rockwall", lat: 32.9312, lng: -96.4597 },
  { id: "mansfield", name: "Mansfield", lat: 32.5632, lng: -97.1417 },
  { id: "waxahachie", name: "Waxahachie", lat: 32.3865, lng: -96.8483 },
  { id: "weatherford", name: "Weatherford", lat: 32.7593, lng: -97.7973 },
  { id: "aledo", name: "Aledo", lat: 32.696, lng: -97.6022 },
];

const BY_ID = new Map(CITIES.map((c) => [c.id, c]));

export function getCity(id: string): City | undefined {
  return BY_ID.get(id);
}

export function isCityId(id: string): boolean {
  return BY_ID.has(id);
}

/** Great-circle distance in miles. */
export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
