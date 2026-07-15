import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const ownerHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self';",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  base: "/",
  build: {
    // Owner-only local recovery artifact. It intentionally excludes the storefront entry.
    outDir: path.resolve(import.meta.dirname, "dist/private-local-only"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "client", "admin.html"),
    },
  },
  server: {
    host: "127.0.0.1",
    strictPort: true,
    headers: ownerHeaders,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    host: "127.0.0.1",
    strictPort: true,
    headers: ownerHeaders,
  },
});
