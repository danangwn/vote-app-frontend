import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    eslint: {
    // WARNING: this disables lint-check during `next build`
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
