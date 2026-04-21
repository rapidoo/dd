import type { Metadata } from 'next';
import { EB_Garamond, IM_Fell_English_SC, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const ebGaramond = EB_Garamond({
  variable: '--font-narr',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
});

const inter = Inter({
  variable: '--font-ui',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const imFell = IM_Fell_English_SC({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400'],
});

const jetbrains = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
});

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
    <html
      lang="fr"
      className={`${ebGaramond.variable} ${inter.variable} ${imFell.variable} ${jetbrains.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-bg text-text">{children}</body>
    </html>
  );
}
