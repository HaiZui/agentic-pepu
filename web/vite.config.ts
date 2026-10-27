/// <reference types="vitest/config" />
import { defineConfig } from "vite";

const backendPort = process.env.BOTTLE_THRONE_PORT ?? "8765";

export default defineConfig({
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    proxy: {
      "/api": `http://127.0.0.1:${backendPort}`,
    },
    fs: {
      // Shared test fixtures live in ../tests/fixtures.
      allow: [".."],
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
