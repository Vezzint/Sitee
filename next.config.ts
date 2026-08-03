import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // 👈 Это самое важное — делает статический сайт
  distDir: 'out',   // Папка, куда соберётся сайт
  images: {
    unoptimized: true, // Для GitHub Pages
  },
};

export default nextConfig;
