import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SwRegister } from './sw-register';

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
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem('chms.theme');if(t&&t!=='sanctuary')document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}

