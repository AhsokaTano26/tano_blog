import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme";
import { ClientLayout } from "@/components/ClientLayout";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "朝花夕拾录",
  description: "A BanG Dreamer!",
};

// Inline script to prevent theme flash - runs before hydration
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('theme');
    if (!t) t = 'dark';
    if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.classList.toggle('dark', t === 'dark');
    document.documentElement.classList.toggle('light', t === 'light');
    document.documentElement.style.colorScheme = t;
    var h = localStorage.getItem('theme-hue');
    if (h) {
      document.documentElement.style.setProperty('--accent-hue', h);
      document.documentElement.style.setProperty('--hue', h);
    }
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen flex flex-col bg-[var(--color-bg)] text-[var(--text-primary)] transition-colors">
        <ThemeProvider>
          <ClientLayout>{children}</ClientLayout>
        </ThemeProvider>
      </body>
    </html>
  );
}
