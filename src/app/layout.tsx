import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Meta Campaign Analytics Dashboard',
  description: 'Instagram & Facebook Campaign Performance Analysis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
