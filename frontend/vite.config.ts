import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  build: {
    sourcemap: true, // unminify errors in devtools (file:line instead of index-xxx.js)
  },
  server: {
    host: "::",
    port: 8080,
    // Proxy backend URLs to Django so /api, /admin, /accounts work when using npm run dev
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/api-auth": "http://127.0.0.1:8000",
      "/admin": "http://127.0.0.1:8000",
      "/accounts": "http://127.0.0.1:8000",
      "/media": "http://127.0.0.1:8000",
      "/static": "http://127.0.0.1:8000",
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
