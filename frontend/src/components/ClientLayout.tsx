'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Header } from '@/components/Header';
import { Banner } from '@/components/Banner';
import { PageTransition } from '@/components/PageTransition';
import { GlobalHeadInjection, FooterInjection } from '@/components/HtmlInjection';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { Footer } from '@/components/Footer';
import { BackToTop } from '@/components/BackToTop';
import { ScrollPositionRestoration } from '@/components/ScrollPositionRestoration';

const MusicPlayer = dynamic(() => import('@/components/MusicPlayer').then(module => module.MusicPlayer), { ssr: false });

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const isHome = pathname === '/';
  const isMusic = pathname === '/music';
  const [playerReady, setPlayerReady] = useState(false);

  useEffect(() => {
    if (playerReady || isAdmin || isMusic) return;
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setPlayerReady(true), { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(() => setPlayerReady(true), 200);
    return () => clearTimeout(id);
  }, [isAdmin, isMusic, playerReady]);

  return (
    <>
      <GlobalHeadInjection />
      <ScrollPositionRestoration />
      <KeyboardShortcuts />
      {!isAdmin && !isMusic && <Header />}
      {!isAdmin && !isHome && !isMusic && <Banner />}
      <main className="flex-1 w-full mx-auto">
        {isAdmin ? children : <PageTransition>{children}</PageTransition>}
      </main>
      {!isAdmin && !isHome && !isMusic && <FooterInjection />}
      {!isAdmin && !isMusic && <Footer />}
      {playerReady && <MusicPlayer hidden={isAdmin || isMusic} />}
      {!isAdmin && !isMusic && <BackToTop />}
    </>
  );
}
