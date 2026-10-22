import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SwRegister } from './sw-register';

export const metadata: Metadata = {
  title: 'ChMS',
  description: 'Church Management System — members, services, giving, SMS',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#1e3a5f',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SwRegister />
        {children}
      </body>
    </html>
  );
}

