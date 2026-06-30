import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import AppFooter from "@/components/AppFooter";
import ClientShell from "@/components/ClientShell";
import PwaInstallBanner from "@/components/PwaInstallBanner";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

export const metadata: Metadata = {
  title: "Basketball Training App",
  description: "Mobile-first Basketball Training App",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "32x32" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  themeColor: "#f4f6f9",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const isAuthenticated = Boolean(cookieStore.get("sb-access-token")?.value);

  return (
    <html lang="de">
      <body>
        <ClientShell>
          <ServiceWorkerRegister />
          <div className="app-shell">{children}</div>
          <AppFooter />
          <PwaInstallBanner />
          <BottomNav isAuthenticated={isAuthenticated} />
        </ClientShell>
      </body>
    </html>
  );
}
