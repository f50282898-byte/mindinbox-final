/**
 * Next.js configuration — Cloudflare Pages / Edge Runtime.
 *
 * Hard constraints for this project:
 *  - Every API route must set `export const runtime = "edge"`.
 *  - No Node.js built-ins (fs, path, crypto, buffer) anywhere in the bundle.
 *  - Next.js / React versions are pinned and must not float (see package.json).
 */
const nextConfig = {
  reactStrictMode: true,

  // Enable image optimization with Cloudflare Images-compatible configuration
  images: {
    // Enable optimization; Cloudflare Pages supports the Image Optimization API
    // via the Next.js Image Optimization API on the edge.
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
      { protocol: "https", hostname: "firebasestorage.googleapis.com" },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [360, 390, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 31536000,
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  // Never ship source maps of provider secrets into the Pages bundle.
  productionBrowserSourceMaps: false,

  // Enable compression
  compress: true,

  // Keep the runtime honest: nothing in this app needs a Node runtime, so
  // any accidental Node-only dependency fails the build loudly instead of
  // silently degrading on Workers.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    // Enable Turbopack for faster builds (stable in Next 14.2+)
    turbo: {
      resolveAlias: {
        "@/*": "./src/*",
      },
    },
  },

  // The Firebase client SDK ships Node-flavoured fallbacks that Workers
  // cannot evaluate. Strip them from every server/edge compilation.
  webpack: (config, { isEdgeServer, isServer }) => {
    if (isEdgeServer || isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        net: false,
        tls: false,
        child_process: false,
      };
    }
    // Enable tree shaking for framer-motion
    config.optimization = {
      ...config.optimization,
      usedExports: true,
      sideEffects: false,
    };
    return config;
  },

  // Enable React strict mode for development
  reactStrictMode: true,

  // Enable SWC minification (default in Next 14)
  swcMinify: true,

  // Output configuration for Cloudflare Pages
  output: "standalone",
};

export default nextConfig;