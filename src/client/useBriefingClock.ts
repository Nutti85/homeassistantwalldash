import { useEffect, useState } from 'react';

/** Wall displays may sleep across a period boundary; wake events must catch up. */
export function useBriefingClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => setNow(new Date());
    const visible = () => { if (document.visibilityState === 'visible') update(); };
    const timer = window.setInterval(update, 30_000);
    window.addEventListener('focus', update);
    window.addEventListener('online', update);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  return now;
}
