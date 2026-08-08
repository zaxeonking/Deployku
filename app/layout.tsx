import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DeployKu — Paket Kode Menuju Situs Hidup",
  description: "Kirim file .zip, dapat URL live di Vercel. Tanpa akun GitHub, tanpa git push.",
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
