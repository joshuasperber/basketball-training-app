import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const isAuthenticated = Boolean(cookieStore.get("sb-access-token")?.value);

  return (
    <html lang="de">
      <body>
        <ServiceWorkerRegister />
        {children}
        <BottomNav isAuthenticated={isAuthenticated} />
      </body>
    </html>
  );
}
