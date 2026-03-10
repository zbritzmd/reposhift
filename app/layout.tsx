import type { Metadata } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoShift — Audit. Standardize. Shift Forward.",
  description:
    "AI-powered codebase audit and standardization. Get senior architect-level intelligence for any repository.",
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "RepoShift — Audit. Standardize. Shift Forward.",
    description:
      "AI-powered codebase audit and standardization. Get senior architect-level intelligence for any repository.",
    url: "https://reposhift.dev",
    siteName: "RepoShift",
    images: [
      {
        url: "https://reposhift.dev/og.png",
        width: 1200,
        height: 630,
        alt: "RepoShift — AI-powered codebase audit",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "RepoShift — Audit. Standardize. Shift Forward.",
    description:
      "AI-powered codebase audit and standardization. Get senior architect-level intelligence for any repository.",
    images: ["https://reposhift.dev/og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-surface flex flex-col">
        <Providers>
          {children}
          <footer className="mt-auto border-t border-border py-6 text-center text-xs text-text-primary/50">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p>&copy; {new Date().getFullYear()} RepoShift. Audit. Standardize. Shift Forward.</p>
              <div className="flex items-center gap-4">
                <a href="https://github.com/reposhift/reposhift" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">GitHub</a>
                <a href="/cli" className="hover:text-text-primary transition-colors">CLI</a>
              </div>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
