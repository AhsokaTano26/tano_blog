'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Banner } from '@/components/Banner';
import { PageTransition } from '@/components/PageTransition';
import { GlobalHeadInjection, FooterInjection } from '@/components/HtmlInjection';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const isHome = pathname === '/';

  return (
    <>
      <GlobalHeadInjection />
      {!isAdmin && <Header />}
      {!isAdmin && !isHome && <Banner />}
      <main className="flex-1 w-full mx-auto">
        <PageTransition>{children}</PageTransition>
      </main>
      <FooterInjection />
    </>
  );
}
