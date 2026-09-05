import type { AiReportMode } from './api';
import type { BriefingPeriod } from './briefingModel';
export type BriefingMode = AiReportMode | 'night';
export const OSLO_TIME_ZONE = 'Europe/Oslo';
export const osloDayKey = (date: Date): string => date.toLocaleDateString('en-CA',{timeZone:OSLO_TIME_ZONE});
export const osloHour = (date: Date): number => Number(new Intl.DateTimeFormat('en-GB',{timeZone:OSLO_TIME_ZONE,hour:'2-digit',hourCycle:'h23'}).format(date));
export const addDay = (day: string, count: number): string => new Date(Date.parse(`${day}T12:00:00Z`)+count*86400000).toISOString().slice(0,10);
// Iteration resolves the offset at the requested local time, including DST changes.
export const osloAt = (day: string, hour: number, minute = 0): Date => {
 const target=Date.parse(`${day}T00:00:00Z`)+hour*3600000+minute*60000;
 let candidate=target;
 for(let i=0;i<3;i++) {
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:OSLO_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(new Date(candidate));
 candidate += target-Date.parse(parts.replace(' ','T')+'Z');
 }
 return new Date(candidate);
};
export const currentBriefingMode = (now: Date): BriefingMode => {
 const hour=osloHour(now);
 return hour<6||hour>=23?'night':hour<9?'morning':hour<15?'midday':hour<19?'afternoon':'evening';
};
const periods={morning:[6,9,'Morgen'],midday:[9,15,'Formiddag'],afternoon:[15,19,'Ettermiddag'],evening:[19,23,'Kveld'],night:[23,6,'Natt']} as const;
export const resolveBriefingPeriod = (mode: BriefingMode, now: Date): BriefingPeriod => {
 if(mode==='full') return {startAt:now.toISOString(),endAt:new Date(now.getTime()+86400000).toISOString(),label:'Neste døgn',source:'current-and-forecast'};
 const [from,to,title]=periods[mode];
 let day=osloDayKey(now);
 if(mode==='night'&&osloHour(now)<6) day=addDay(day,-1);
 let start=osloAt(day,from), end=osloAt(addDay(day,mode==='night'?1:0),to);
 if(now>=end){day=addDay(day,1);start=osloAt(day,from);end=osloAt(addDay(day,mode==='night'?1:0),to)}
 const active=now>=start&&now<end;
 const date=day!==osloDayKey(now)&&!active?` · ${start.toLocaleDateString('nb-NO',{timeZone:OSLO_TIME_ZONE,day:'numeric',month:'short'})}`:'';
 return {startAt:(active?now:start).toISOString(),endAt:end.toISOString(),label:`${title}${date} · ${String(from).padStart(2,'0')}:00–${String(to).padStart(2,'0')}:00`,source:active?'current-and-forecast':'forecast'};
};
