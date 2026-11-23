import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [vue()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/auth/petrock/start": "http://127.0.0.1:8080",
      "/auth/petrock/callback": {
        target: "http://127.0.0.1:8080",
        bypass: (req) => (req.method === "GET" ? req.url : undefined),
      },
      "/auth/test-login": "http://127.0.0.1:8080",
      "/auth/me": "http://127.0.0.1:8080",
      "/auth/logout": "http://127.0.0.1:8080",
      // the table and link endpoints; every one is a POST, so no page route is shadowed
      "/api": "http://127.0.0.1:8080",
    },
  },
});
