import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";

const APP_BUILD_ID =
  process.env.CF_PAGES_COMMIT_SHA ||
  process.env.CF_PAGES_DEPLOYMENT_ID ||
  process.env.GITHUB_SHA ||
  "local-dev";

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },
});
