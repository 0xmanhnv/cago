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
  // Product images are served by Frappe under /files — use plain <img>, no domain config.
  async rewrites() {
    const passthrough = ["/api", "/app", "/files", "/private", "/assets", "/socket.io"];
    return passthrough.map((p) => ({
      source: `${p}/:path*`,
      destination: `${FRAPPE}${p}/:path*`,
    }));
  },
};

export default nextConfig;
