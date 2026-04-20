import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DetD — D&D 5e avec agents IA',
  description: 'Jouez à Donjons & Dragons en solo ou en petit groupe avec un MJ IA.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-[#0a0604] text-[#f2e8d0]">{children}</body>
    </html>
  );
}
