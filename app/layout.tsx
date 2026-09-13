import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Avatar Studio — A space to think",
  description:
    "Meet Charlie: a thoughtful assistant with a little more expression.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
