import type { Metadata } from "next";
import "./globals.css";

const TITLE = "Wassel - School transport, made visible";
const DESCRIPTION =
  "A school transport platform that puts the transport office, drivers and parents on one shared view of the morning, so every ride can be accounted for.";

export const metadata: Metadata = {
  // Absolute base for the Open Graph image URL; set NEXT_PUBLIC_SITE_URL per environment.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: TITLE, template: "%s | Wassel" },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Wassel",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/landing/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "A yellow school bus on a limestone street in Beirut at sunrise.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/landing/og-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
