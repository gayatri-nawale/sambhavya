import type { ReactNode } from 'react';

export interface PhoneFrameProps {
  /** Message sender shown in the header, e.g. "Weather alert". */
  sender: string;
  /** Clock in the status bar. */
  time: string;
  /** BCP 47 language of the message, e.g. "hi" for Hindi. */
  lang?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/**
 * A phone showing an SMS-style message. One of the few floating elements, so
 * it is the one place with a shadow.
 */
export function PhoneFrame({ sender, time, lang, children, footer, className }: PhoneFrameProps) {
  return (
    <figure className={`m-0 w-[280px] max-w-full rounded-[32px] border-[6px] border-ink bg-ink shadow-[0_18px_40px_-12px_rgba(20,33,61,0.45)] ${className ?? ''}`}>
      <div className="overflow-hidden rounded-[26px] bg-mist">
        <div className="flex items-center justify-between px-5 pb-1 pt-2 text-small font-medium tabular-nums">
          <span>{time}</span>
          <span className="h-4 w-16 rounded-full bg-ink" aria-hidden="true" />
          <span aria-hidden="true">5G</span>
        </div>
        <div className="border-b border-line bg-paper px-4 py-2 text-center">
          <p className="text-small font-semibold">{sender}</p>
          <p className="text-small text-ink/70">Text message</p>
        </div>
        <div className="min-h-[300px] px-3 py-4">
          <div lang={lang} className="max-w-[92%] rounded-[16px] rounded-bl-[4px] bg-paper px-3 py-2 text-body leading-snug">
            {children}
          </div>
          {footer && <div className="mt-3 px-1 text-small text-ink/70">{footer}</div>}
        </div>
      </div>
    </figure>
  );
}
