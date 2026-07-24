'use client';

import { CircleAlert, Info, Lightbulb, OctagonAlert, TriangleAlert } from 'lucide-react';

const alertConfig = {
  note: { label: 'Note', Icon: Info },
  tip: { label: 'Tip', Icon: Lightbulb },
  important: { label: 'Important', Icon: CircleAlert },
  warning: { label: 'Warning', Icon: TriangleAlert },
  caution: { label: 'Caution', Icon: OctagonAlert },
} as const;

export function MarkdownAlert({ className, children, node: _node, ...props }: any) {
  const classes = typeof className === 'string' ? className.split(' ') : [];
  const type = Object.keys(alertConfig).find((name) => classes.includes(`markdown-alert-${name}`)) as keyof typeof alertConfig | undefined;

  if (!classes.includes('markdown-alert') || !type) {
    return <div className={className} {...props}>{children}</div>;
  }

  const { label, Icon } = alertConfig[type];
  return (
    <div className={className} {...props}>
      <div className="markdown-alert-heading">
        <Icon className="w-4 h-4" aria-hidden="true" />
        <span>{label}</span>
      </div>
      {children}
    </div>
  );
}
