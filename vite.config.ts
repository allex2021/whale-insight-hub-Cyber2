import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        "http-proxy-agent": "/@fs/dev/null",
        "https-proxy-agent": "/@fs/dev/null",
        "socks-proxy-agent": "/@fs/dev/null",
      },
    },
    build: {
      rollupOptions: {
        external: [
          "http-proxy-agent",
          "https-proxy-agent", 
          "socks-proxy-agent",
        ],
      },
    },
  },
});
