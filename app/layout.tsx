import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DeployKu — Upload Zip, Auto Deploy",
  description: "Deploy website ke Vercel langsung dari file zip, tanpa akun GitHub.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
