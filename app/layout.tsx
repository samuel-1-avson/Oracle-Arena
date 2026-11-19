import type { Metadata } from 'next';
import { Cinzel, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-cinzel',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Oracle Arena — Tactical 5v5 Collectible Card Strategy',
  description:
    'An AI-powered strategic 5v5 collectible card battle game where players command original characters in tactical turn-based combat.',
  openGraph: {
    title: 'Oracle Arena — Tactical 5v5 Collectible Card Strategy',
    description:
      'Command five unique champions in deterministic turn-based 5v5 card battles with shields, elemental abilities, statuses, and tactical mastery.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Oracle Arena — Tactical 5v5 Collectible Card Strategy',
    description:
      'Command five unique champions in deterministic turn-based 5v5 card battles.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${plusJakarta.variable} ${jetbrainsMono.variable} dark`}
    >
      <body
        suppressHydrationWarning
        data-state="title"
        className="bg-[#090B10] text-[#ECEEF4] font-sans antialiased selection:bg-[#D4AF37]/30 selection:text-[#F6E5B0] overflow-x-hidden"
      >
        {children}
      </body>
    </html>
  );
}
