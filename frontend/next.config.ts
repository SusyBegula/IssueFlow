import type { NextConfig } from "next";
const config: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  devIndicators: false,
};
export default config;
