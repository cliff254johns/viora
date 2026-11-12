import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./web/wrangler.toml" },
    }),
  ],
  test: {
    include: ["tests/cloudflare/**/*.test.mjs"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
