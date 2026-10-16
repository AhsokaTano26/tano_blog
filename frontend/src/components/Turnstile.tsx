"use client";

import { useEffect, useRef } from 'react';

type TurnstileAPI = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

export function Turnstile({ sitekey, action, onToken }: {
  sitekey: string; action: string; onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true;
    let widget: string | undefined;
    let timer: ReturnType<typeof setTimeout>;
    const getAPI = () => (window as unknown as { turnstile?: TurnstileAPI }).turnstile;
    if (!document.querySelector('script[src*="turnstile"]')) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      document.head.appendChild(script);
    }
    const render = () => {
      if (!active || !container.current) return;
      const api = getAPI();
      if (!api) { timer = setTimeout(render, 200); return; }
      widget = api.render(container.current, { sitekey, action, callback: onToken,
        'expired-callback': () => onToken(''), 'error-callback': () => onToken('') });
    };
    render();
    return () => {
      active = false;
      clearTimeout(timer);
      if (widget !== undefined) { try { getAPI()?.remove(widget); } catch {} }
      onToken('');
    };
  }, [sitekey, action, onToken]);
  return <div ref={container} />;
}
