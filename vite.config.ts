import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    ssr: {
      noExternal: [],
      external: ["ccxt"],
    },
    resolve: {
      alias: {
        "http-proxy-agent": new URL("./src/lib/empty-shim.ts", import.meta.url).pathname,
        "https-proxy-agent": new URL("./src/lib/empty-shim.ts", import.meta.url).pathname,
        "socks-proxy-agent": new URL("./src/lib/empty-shim.ts", import.meta.url).pathname,
      },
    },
    optimizeDeps: {
      exclude: ["ccxt"],
    },
    build: {
      rollupOptions: {
        external: [
          "ccxt",
          "http-proxy-agent",
          "https-proxy-agent",
          "socks-proxy-agent",
        ],
      },
    },
  },
});
