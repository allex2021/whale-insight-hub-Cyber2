import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: {
        "http-proxy-agent": path.resolve(__dirname, "./src/lib/empty-shim.ts"),
        "https-proxy-agent": path.resolve(__dirname, "./src/lib/empty-shim.ts"),
        "socks-proxy-agent": path.resolve(__dirname, "./src/lib/empty-shim.ts"),
      },
    },
    ssr: {
      noExternal: ["ccxt"], // force bundling ccxt so aliases apply
    },
    optimizeDeps: {
      exclude: ["ccxt"],
    },
  },
});
