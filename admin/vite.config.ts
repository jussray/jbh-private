import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

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
    // Local backup output only. This directory must never be uploaded or deployed.
    outDir: path.resolve(import.meta.dirname, "dist/private-local-only"),
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    strictPort: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    host: "127.0.0.1",
    strictPort: true,
  },
});
