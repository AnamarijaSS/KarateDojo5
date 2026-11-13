import type { NextConfig } from "next";

// Statični izvoz: aplikacija je v celoti v brskalniku, strežniška logika je v Supabase.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
