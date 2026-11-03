import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme";
import { themeBootstrap } from "@/lib/theme";
export const metadata: Metadata = {
  title: "IssueFlow",
  description: "Project and issue tracking.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
