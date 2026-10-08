import{fetchRoadRoute,type RoadRouteResult}from'./roadRouting';
import{validateTrip}from'../utils/catalogRules';
import type{TripPlan}from'../types/catalog';
export type PlannedLeg={fromIndex:number;route:RoadRouteResult;departureAt:number;arrivalAt:number};
export async function calculateItinerary(trip:TripPlan):Promise<PlannedLeg[]>{
 validateTrip(trip);const legs:PlannedLeg[]=[];let departureAt=trip.startsAt+trip.stops[0]!.stayMinutes*60000;
 for(let i=1;i<trip.stops.length;i++){const route=await fetchRoadRoute(trip.stops[i-1]!,trip.stops[i]!,trip.mode);if(!route)throw new Error(`Chưa tìm được đường đến ${trip.stops[i]!.name}.`);const arrivalAt=departureAt+route.durationSeconds*1000;legs.push({fromIndex:i-1,route,departureAt,arrivalAt});departureAt=arrivalAt+trip.stops[i]!.stayMinutes*60000;}
 return legs;
}
