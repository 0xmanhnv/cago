/**
 * The Next.js app is the public entry. It server-proxies all Frappe paths to the
 * internal Frappe nginx so the browser sees ONE origin — cookies (sid) + CSRF work
 * exactly as they did with the server-rendered pages.
 */
// NOTE: Next evaluates rewrites() at BUILD time, so this is baked into the image.
// Default targets the compose service name; override with FRAPPE_INTERNAL_URL at build
// time for non-docker dev (e.g. http://localhost:8080).
const FRAPPE = process.env.FRAPPE_INTERNAL_URL || "http://frontend:8080";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Proxy strategy: Next OWNS its own routes (/, /login, /owner/*, /staff/*, /products/*,
  // /cart, /assistant, /my-debt, /_next/*). EVERYTHING else is Frappe — and Frappe has many
  // top-level paths (/api, /app, /desk, /printview, /print, /report, /method, /files, /assets,
  // /socket.io, /private, website pages...). A hardcoded whitelist always leaks (e.g. /printview
  // 404'd). So:
  //   - beforeFiles: infra paths that must ALWAYS reach Frappe (never shadowed by a Next route).
  //   - fallback:    catch-all — anything Next didn't match → Frappe. Future-proof, no leaks.
  async rewrites() {
    const toFrappe = (p) => ({ source: `${p}/:path*`, destination: `${FRAPPE}${p}/:path*` });
    return {
      beforeFiles: ["/api", "/assets", "/files", "/private", "/socket.io"].map(toFrappe),
      fallback: [{ source: "/:path*", destination: `${FRAPPE}/:path*` }],
    };
  },
};

export default nextConfig;
