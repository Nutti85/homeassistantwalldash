import { describe, it, expect } from 'vitest';
import { currentBriefingMode, resolveBriefingPeriod } from './briefingPeriod';
describe('live Oslo periods', () => {
 it.each([[5,'night'],[6,'morning'],[9,'midday'],[15,'afternoon'],[19,'evening'],[23,'night']] as const)('changes at %s', (hour, mode) => expect(currentBriefingMode(new Date(`2026-09-05T${String(hour).padStart(2,'0')}:00:00+02:00`))).toBe(mode));
 it('uses remaining hours independently of publication', () => expect(resolveBriefingPeriod('afternoon',new Date('2026-09-05T14:00:00Z')).startAt).toBe('2026-09-05T14:00:00.000Z'));
 it.each(['2026-03-29T00:30:00Z','2026-10-25T01:30:00Z'])('ends DST night at six Oslo %s', time => {
 const p=resolveBriefingPeriod('night',new Date(time));
 expect(new Date(p.endAt).toLocaleTimeString('nb-NO',{timeZone:'Europe/Oslo',hour:'2-digit',minute:'2-digit'})).toBe('06:00');
 expect(p.startAt).toBe(new Date(time).toISOString());
 });
 it('labels next morning with a date',()=>expect(resolveBriefingPeriod('morning',new Date('2026-09-05T18:00:00Z')).label).toContain('6. sep'));
 it('full stays precisely 24 elapsed hours through DST',()=>{const p=resolveBriefingPeriod('full',new Date('2026-03-28T20:00:00Z'));expect(Date.parse(p.endAt)-Date.parse(p.startAt)).toBe(86400000)});
});
