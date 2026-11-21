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

const EXTENSION_ERROR_GUARD_SCRIPT = `
(function () {
  var EXT_RE = /(?:chrome|moz|safari)-extension:\\/\\//i;
  function isExtensionOrigin(filename, stack, message) {
    if (filename && EXT_RE.test(filename)) return true;
    var origin = window.location && window.location.origin ? window.location.origin : '';
    if (stack && EXT_RE.test(stack) && (!origin || stack.indexOf(origin) === -1)) return true;
    if (message && /Failed to connect to MetaMask/i.test(message)) return true;
    return false;
  }
  window.addEventListener('error', function (event) {
    var err = event && event.error;
    var stack = err && typeof err.stack === 'string' ? err.stack : '';
    var msg = (event && event.message) || (err && err.message) || '';
    if (isExtensionOrigin(event && event.filename, stack, msg)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event && event.reason;
    var stack = reason && typeof reason.stack === 'string' ? reason.stack : '';
    var msg = typeof reason === 'string' ? reason : (reason && reason.message) || '';
    if (isExtensionOrigin('', stack, msg)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
})();
`;

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
      <head>
        <script
          id="extension-error-guard"
          dangerouslySetInnerHTML={{ __html: EXTENSION_ERROR_GUARD_SCRIPT }}
        />
      </head>
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
