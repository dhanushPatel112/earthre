import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'EarthRe SLA Monitoring Dashboard',
  description: 'Monitoring dashboard and ingestion pipeline.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
