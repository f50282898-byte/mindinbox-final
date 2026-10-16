/**
 * Next.js configuration — OpenNext on Cloudflare Workers.
 *
 * OpenNext runs the application on Workers' Node.js compatibility runtime.
 * Next.js Edge Runtime route exports are not supported by the Cloudflare adapter.
 */
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig = {
  reactStrictMode: true,

  // Keep images as static requests; Workers do not run Next's Node image optimizer.
  images: {
    unoptimized: true,
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

  // Never ship source maps of provider secrets in a Worker deployment.
  productionBrowserSourceMaps: false,

  // Enable compression
  compress: true,

  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },

  /*
    Moved out of `experimental` in Next 15 — `experimental.turbo` is deprecated and
    logs on every build. The equivalent key is the top-level `turbopack`, which is
    only consulted when a Turbopack build is requested; `next build` and
    `next dev` without `--turbopack` still use webpack and ignore it.

    The `@/*` alias is also declared in `tsconfig.json` paths and is resolved by
    webpack from there, so this entry is a convenience for Turbopack runs rather
    than load-bearing for the build.
  */
  turbopack: {
    resolveAlias: {
      "@/*": "./src/*",
    },
  },

  webpack: (config) => {
    // Enable tree shaking for framer-motion
    config.optimization = {
      ...config.optimization,
      usedExports: true,
      sideEffects: false,
    };
    return config;
  },
};

export default nextConfig;