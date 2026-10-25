const CONNECT_SRC = [
  "'self'",
  "https://*.googleapis.com",
  "https://*.firebaseio.com",
  "wss://*.firebaseio.com",
  "https://identitytoolkit.googleapis.com",
  "https://securetoken.googleapis.com",
  "https://firebasestorage.googleapis.com",
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
  "https://apis.google.com",
  "https://www.google.com",
  "https://www.googleapis.com",
  "https://challenges.cloudflare.com",
  "https://api.paddle.com",
  "https://api.lemonsqueezy.com",
].join(" ");

const FRAME_SRC = [
  "'self'",
  "https://accounts.google.com",
  "https://*.firebaseapp.com",
  "https://challenges.cloudflare.com",
  "https://www.youtube-nocookie.com",
].join(" ");

const SCRIPT_SRC = [
  "'self'",
  "https://apis.google.com",
  "https://www.google.com",
  "https://www.googleapis.com",
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
].join(" ");

const IMG_SRC = [
  "'self'",
  "data:",
  "blob:",
  "https://*.googleusercontent.com",
  "https://i.ytimg.com",
  "https://yt3.ggpht.com",
].join(" ");

const FONT_SRC = ["'self'", "data:", "https://fonts.gstatic.com"].join(" ");

const STYLE_SRC = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"].join(" ");

export interface CspOptions {
  nonce?: string;
  extra?: Record<string, string[]>;
}

export function cspDirectives(options: CspOptions = {}): Record<string, string[]> {
  const scriptSrc = options.nonce
    ? `'self' 'nonce-${options.nonce}' 'strict-dynamic' https://apis.google.com https://www.google.com https://www.googleapis.com https://accounts.google.com https://oauth2.googleapis.com 'unsafe-inline'`
    : SCRIPT_SRC;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": scriptSrc.split(" "),
    "script-src-elem": scriptSrc.split(" "),
    "style-src": STYLE_SRC.split(" "),
    "img-src": IMG_SRC.split(" "),
    "font-src": FONT_SRC.split(" "),
    "connect-src": CONNECT_SRC.split(" "),
    "frame-src": FRAME_SRC.split(" "),
    "media-src": ["'self'", "blob:"],
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "object-src": ["'none'"],
    "upgrade-insecure-requests": [],
    ...(options.extra ?? {}),
  };

  return directives;
}

export function renderCsp(options: CspOptions = {}): string {
  return Object.entries(cspDirectives(options))
    .map(([directive, values]) => (values.length === 0 ? directive : `${directive} ${values.join(" ")}`))
    .join("; ");
}

export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ["Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload"],
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "strict-origin"],
  [
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  ],
  ["X-Frame-Options", "DENY"],
  ["X-DNS-Prefetch-Control", "off"],
  ["Cross-Origin-Opener-Policy", "same-origin-allow-popups"],
];

export const SECURITY_HEADER_NAMES = SECURITY_HEADERS.map(([name]) => name.toLowerCase());