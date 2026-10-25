import type { ReactNode } from 'react';

/** A shared page rhythm; actions and page state stay owned by each route. */
export function AdminPageHeader({ title, description, section = '内容管理', children }: {
  title: string;
  description: ReactNode;
  section?: string;
  children?: ReactNode;
}) {
  return <header className="admin-page-heading">
    <div className="admin-page-intro">
      <p className="admin-eyebrow">{section}</p>
      <h1>{title}</h1>
      <p className="admin-page-description">{description}</p>
    </div>
    {children && <div className="admin-heading-actions">{children}</div>}
  </header>;
}
