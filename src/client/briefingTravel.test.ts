import {it,expect} from 'vitest';
import {calendarEvents} from './dashboardModel';
import {calendarTrips,relevantTrips} from './briefingTravel';
it('keeps calendar identity and filters cancelled events',()=>{
const events=calendarEvents({entity_id:'calendar.family',state:'on',attributes:{events:[{uid:'a',summary:'Besøk',location:'Biblioteket',start:'2026-09-06T10:00:00+02:00',status:'confirmed'},{uid:'b',summary:'Avlyst',start:'2026-09-06T12:00:00+02:00',status:'cancelled'}]}});
expect(events).toHaveLength(1);expect(events[0]).toMatchObject({id:'a',location:'Biblioteket',status:'confirmed'});
});
it('supports physical weekend trips without inventing travel times',()=>{
const trips=calendarTrips([{id:'a',title:'Besøk',location:'Biblioteket',start:'2026-09-06T10:00:00+02:00',allDay:false}]);
expect(relevantTrips(trips,new Date('2026-09-06T07:00:00Z'),false)).toHaveLength(1);expect(trips[0].minutes).toBeUndefined();
});
it('uses route metadata supplied by the calendar event when it is fresh',()=>{
const events=calendarEvents({entity_id:'calendar.family',state:'on',attributes:{events:[{uid:'a',summary:'Besøk',location:'Biblioteket',start:'2026-09-06T10:00:00+02:00',travel_minutes:20,travel_updated_at:'2026-09-06T07:55:00Z'}]}});
const trips=calendarTrips(events);
expect(trips[0].minutes).toMatchObject({value:20,observedAt:'2026-09-06T07:55:00Z',quality:'available'});
});
it('excludes online, undated-destination and all-day events',()=>expect(calendarTrips(['Teams','https://meet.example.test',''].map(location=>({title:'Møte',location,start:'2026-09-06T10:00:00Z',allDay:false})))).toEqual([]));
it('requires verified workday and removes finished trips',()=>{
const trip={id:'work',kind:'commute' as const,startsAt:'2026-09-07T07:35:00Z'};
expect(relevantTrips([trip],new Date('2026-09-07T06:00:00Z'),undefined)).toEqual([]);
expect(relevantTrips([trip],new Date('2026-09-07T06:00:00Z'),false)).toEqual([]);
expect(relevantTrips([trip],new Date('2026-09-07T06:00:00Z'),true)).toHaveLength(1);
expect(relevantTrips([trip],new Date('2026-09-07T08:00:00Z'),true)).toEqual([]);
});
