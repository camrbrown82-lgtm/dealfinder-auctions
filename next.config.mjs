/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async redirects() {
    return [
      { source: "/admin/review", destination: "/admin/consignments", permanent: false },
      { source: "/collections", destination: "/live", permanent: true },
      { source: "/collections/:path*", destination: "/live", permanent: true },
      { source: "/products", destination: "/live", permanent: true },
      { source: "/products/:path*", destination: "/live", permanent: true },
      { source: "/pages", destination: "/", permanent: true },
      { source: "/pages/:path*", destination: "/", permanent: true },
      { source: "/cart", destination: "/checkout", permanent: true },
      { source: "/account", destination: "/profile", permanent: true },
      { source: "/account/:path*", destination: "/profile", permanent: true },
    ];
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/logo.webp" }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Permissions-Policy", value: "camera=(self)" }],
      },
    ];
  },
};

export default nextConfig;
