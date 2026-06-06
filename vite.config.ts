import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        external: ["http-proxy-agent", "https-proxy-agent", "socks-proxy-agent", "ccxt"],
      },
    },
  },
});
