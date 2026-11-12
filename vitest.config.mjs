import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Use a test-only Wrangler config without preview/remote bindings.
// CI runs Durable Objects locally in workerd; it must never need production credentials.
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./web/wrangler.test.toml" },
    }),
  ],
  test: {
    include: ["tests/cloudflare/**/*.test.mjs"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
