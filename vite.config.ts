import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "http-proxy-agent": path.resolve(__dirname, "./src/lib/empty.ts"),
      "https-proxy-agent": path.resolve(__dirname, "./src/lib/empty.ts"),
      "socks-proxy-agent": path.resolve(__dirname, "./src/lib/empty.ts"),
    },
  },
  build: {
    rollupOptions: {
      external: [],
    },
  },
  optimizeDeps: {
    exclude: ["ccxt"],
  },
});
