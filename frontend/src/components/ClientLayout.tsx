'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Banner } from '@/components/Banner';
import { PageTransition } from '@/components/PageTransition';
import { GlobalHeadInjection, FooterInjection } from '@/components/HtmlInjection';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { Footer } from '@/components/Footer';
import { BackToTop } from '@/components/BackToTop';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const isHome = pathname === '/';

  return (
    <>
      <GlobalHeadInjection />
      <KeyboardShortcuts />
      {!isAdmin && <Header />}
      {!isAdmin && !isHome && <Banner />}
      <main className="flex-1 w-full mx-auto">
        {isAdmin ? children : <PageTransition>{children}</PageTransition>}
      </main>
      {!isAdmin && !isHome && <FooterInjection />}
      {!isAdmin && <Footer />}
      {!isAdmin && <BackToTop />}
    </>
  );
}
