import { useEffect, useRef, useState } from 'react';

const Icon = ({ children }: { children: string }) => <span className="material-symbols-outlined" aria-hidden="true">{children}</span>;

export function CameraCard({ title, available, streamPath }: { title: string; available: boolean; streamPath: string }) {
  const [streamAttempt, setStreamAttempt] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const retryTimer = useRef<number>();

  useEffect(() => {
    setStreamAttempt(0);
    return () => { if (retryTimer.current) window.clearTimeout(retryTimer.current); };
  }, [available]);
  useEffect(() => {
    const syncFullscreen = () => setFullscreen(document.fullscreenElement === frameRef.current);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => document.removeEventListener('fullscreenchange', syncFullscreen);
  }, []);

  const imageSource = `${streamPath}?attempt=${streamAttempt}`;
  const liveLabel = `Direktevideo fra ${title.toLocaleLowerCase('nb-NO')}`;
  const reconnect = () => {
    if (retryTimer.current) window.clearTimeout(retryTimer.current);
    retryTimer.current = window.setTimeout(() => setStreamAttempt((current) => current + 1), 750);
  };
  const toggleFullscreen = async () => {
    if (document.fullscreenElement === frameRef.current) await document.exitFullscreen?.();
    else await frameRef.current?.requestFullscreen?.();
  };

  return <section className="card doorbell-card" aria-label={title}>
    <h2>{title}</h2>
    <div ref={frameRef} className="camera-frame">
      {available
        ? <img src={imageSource} alt={liveLabel} onError={reconnect}/>
        : <div className="camera-unavailable"><Icon>videocam_off</Icon><span>— Kamera ikke tilgjengelig</span></div>}
      {available && <span className="live-badge">LIVE</span>}
      <div className="camera-controls"><button type="button" aria-label={fullscreen ? `Avslutt fullskjerm for ${title}` : `Vis ${title} i fullskjerm`} onClick={() => void toggleFullscreen()}><Icon>{fullscreen ? 'fullscreen_exit' : 'fullscreen'}</Icon></button></div>
    </div>
  </section>;
}
