import type {Trip} from '../shared/briefing';
import type {CalendarEvent} from './dashboardModel';
export const ARRIVAL_MARGIN_MINUTES=10;
export const calendarTrips=(events:CalendarEvent[]):Trip[]=>events.filter(event=>!event.allDay&&event.status!=='cancelled'&&event.location?.trim()&&!/https?:|teams|zoom|google meet|nett(møte)?|digital|hjemmekontor/i.test(event.location)).map(event=>({id:`calendar:${event.id??`${event.start}:${event.title}`}${event.recurrenceId?`:${event.recurrenceId}`:''}`,kind:'calendar',startsAt:event.start,destination:event.location,title:event.title,...(event.travelMinutes ? { minutes: { value:event.travelMinutes, observedAt:event.travelObservedAt, fetchedAt:event.travelObservedAt??event.start, quality:event.travelObservedAt?'available' as const:'unknown' as const } } : {})}));
export const tripDeparture=(trip:Trip,now:Date):Date|undefined=>{
 const reading=trip.minutes;
 if(!reading||reading.quality!=='available'||reading.value===undefined||reading.value<=0||!reading.observedAt||now.getTime()-Date.parse(reading.observedAt)>300000) return undefined;
 return new Date(Date.parse(trip.startsAt)-(reading.value+ARRIVAL_MARGIN_MINUTES)*60000);
};
export const relevantTrips=(trips:Trip[],now:Date,isWorkday:boolean|undefined):Trip[]=>trips.filter(trip=>{
 if(trip.kind==='commute'&&isWorkday!==true) return false;
 const start=Date.parse(trip.startsAt); if(!Number.isFinite(start)||start<=now.getTime()) return false;
 const departure=tripDeparture(trip,now)?.getTime()??start;
 return departure-now.getTime()<=7200000;
}).sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
