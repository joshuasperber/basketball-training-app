import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

export const metadata = {
  title: "Basketball Training App",
  icons: {
    src: "/android-chrome-512x512.png",
    sizes: "512x512",
    type: "image/png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body>
        {children}
        <BottomNav />
      </body>
    </html>
  );
}