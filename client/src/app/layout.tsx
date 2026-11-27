import type { Metadata } from "next";
import "./globals.css";
import { ActorProvider } from "@/hooks/useActor";
import { AppShell } from "@/components/layout/AppShell";

export const metadata: Metadata = {
  title: "Warwick Spaces · Campus Learning Resources Booking System",
  description:
    "Unified booking, availability, approvals, and privacy-safe fairness analytics across University of Warwick learning spaces, equipment, and academic support.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ActorProvider>
          <AppShell>{children}</AppShell>
        </ActorProvider>
      </body>
    </html>
  );
}
