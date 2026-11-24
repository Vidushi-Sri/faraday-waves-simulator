import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Carbon's Sass references IBM Plex fonts with webpack's "~@ibm/plex"
    // prefix. Map it to node_modules so the fonts are bundled.
    alias: [{
      find: /^~@ibm\//,
      replacement: fileURLToPath(new URL("./node_modules/@ibm/", import.meta.url)),
    }],
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8000" },
  },
});
