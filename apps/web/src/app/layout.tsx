import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Newsreader, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { SwRegister } from './sw-register';

const bodyFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const displayFont = Newsreader({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-serif',
  display: 'swap',
});

// Prerendered HTML cannot receive the per-request CSP nonce from middleware.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ChMS',
  description: 'Church Management System — members, services, offerings, SMS',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#1f4d3a',
  width: 'device-width',
  initialScale: 1,
};

// Runs before first paint so a saved theme (or dark mode) never flashes the
// default colours on the way in.
const THEME_BOOTSTRAP = `try{var d=document.documentElement.dataset,t=localStorage.getItem('chms.theme'),f=localStorage.getItem('chms.fontSize');if(t&&t!=='sanctuary')d.theme=t;if(f&&f!=='normal')d.fontSize=f;}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" className={`${bodyFont.variable} ${displayFont.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}

