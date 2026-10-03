import { useRef, type CSSProperties, type KeyboardEventHandler, type ReactNode, type Ref } from 'react';

const Icon = ({ children }: { children: string }) => <span className="material-symbols-outlined" aria-hidden="true">{children}</span>;

export function DashboardModalShell({ children, close, closeLabel, closeButtonRef, dialogRef, width, className, ariaLabel, labelledBy, onKeyDown, tabIndex }: {
  children: ReactNode;
  close: () => void;
  closeLabel: string;
  closeButtonRef?: Ref<HTMLButtonElement>;
  dialogRef?: Ref<HTMLDivElement>;
  width?: string;
  className?: string;
  ariaLabel?: string;
  labelledBy?: string;
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  tabIndex?: number;
}) {
  const internalCloseRef = useRef<HTMLButtonElement>(null);
  return <div ref={dialogRef} className={`dashboard-modal-shell${className ? ` ${className}` : ''}`} style={width ? { '--dashboard-modal-width': width } as CSSProperties : undefined} role="dialog" aria-modal="true" aria-label={ariaLabel} aria-labelledby={labelledBy} onKeyDown={onKeyDown} tabIndex={tabIndex}>
    <button className="dashboard-modal-close" ref={closeButtonRef ?? internalCloseRef} type="button" aria-label={closeLabel} onClick={close}><Icon>close</Icon></button>
    {children}
  </div>;
}
