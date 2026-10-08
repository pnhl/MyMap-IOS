import type {RouteGuidance} from '../services/roadRouting';
export function guidanceSpeechCue(guidance:RouteGuidance|null){
 if(!guidance||!Number.isFinite(guidance.distanceMeters)||guidance.distanceMeters<0||guidance.distanceMeters>550||!guidance.instruction)return null;
 const threshold=guidance.distanceMeters<=60?60:guidance.distanceMeters<=200?200:500;
 const maneuver=JSON.stringify([guidance.position,guidance.type,guidance.modifier,guidance.instruction]);
 return {key:maneuver+':'+threshold,text:guidance.type==='arrive'&&threshold===60?'Bạn sắp đến điểm đích.':`Sau ${Math.max(10,Math.round(guidance.distanceMeters/10)*10)} mét, ${guidance.instruction}`};
}
