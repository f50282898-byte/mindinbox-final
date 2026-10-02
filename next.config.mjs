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

  // Cloudflare Pages has no image optimisation server; serve originals.
  images: {
    unoptimized: true,
  },

  // Never ship source maps of provider secrets into the Pages bundle.
  productionBrowserSourceMaps: false,

  // Keep the runtime honest: nothing in this app needs a Node runtime, so
  // any accidental Node-only dependency fails the build loudly instead of
  // silently degrading on Workers.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
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
    return config;
  },
};

export default nextConfig;