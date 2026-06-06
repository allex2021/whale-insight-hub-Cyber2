import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    optimizeDeps: {
      exclude: ["ccxt"],
    },
  },
});
