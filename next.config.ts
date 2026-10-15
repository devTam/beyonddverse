import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { typedEnv: true },
  async headers() {
    return [{ source: "/(.*)", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
      { key: "Content-Security-Policy", value: "default-src 'self'; img-src 'self' data: blob: https://res.cloudinary.com; media-src 'self' blob: https://res.cloudinary.com; connect-src 'self' https://api.cloudinary.com https://*.trigger.dev; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com https://www.facebook.com https://www.tiktok.com" },
    ] }];
  },
};

export default nextConfig;
