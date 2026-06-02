/**
 * The Next.js app is the public entry. It server-proxies Frappe paths to the internal Frappe
 * nginx so the browser sees ONE origin — cookies (sid) + CSRF work exactly as before.
 */
// NOTE: Next evaluates rewrites() at BUILD time, so this is baked into the image.
// Default targets the compose service name; override with FRAPPE_INTERNAL_URL at build
// time for non-docker dev (e.g. http://localhost:8080).
const FRAPPE = process.env.FRAPPE_INTERNAL_URL || "http://frontend:8080";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next OWNS its own routes (/, /login, /pos/*, /products/*, /cart, /assistant, /my-debt, ...).
  // We proxy the KNOWN Frappe top-level prefixes (Desk + POS Awesome at /app, the REST API, print
  // views, uploads, assets, websocket). Anything else that Next doesn't have a route for now falls
  // through to Next's own branded 404 (app/not-found.tsx) instead of Frappe's plain page — so a
  // typo'd URL shows the friendly error screen. (Decoupled app: no Frappe website pages at root.)
  async rewrites() {
    const toFrappe = (p) => ({ source: `${p}/:path*`, destination: `${FRAPPE}${p}/:path*` });
    return {
      beforeFiles: ["/api", "/app", "/assets", "/files", "/private", "/socket.io", "/method", "/printview", "/print", "/report"].map(toFrappe),
    };
  },
};

export default nextConfig;
