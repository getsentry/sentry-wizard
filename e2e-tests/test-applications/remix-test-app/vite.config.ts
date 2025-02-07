import { sentryVitePlugin } from "@sentry/vite-plugin";
import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [remix({
    future: {
      v3_fetcherPersist: true,
      v3_relativeSplatPath: true,
      v3_throwAbortReason: true,
    },
  }), tsconfigPaths(), sentryVitePlugin({
    org: "TEST_ORG_SLUG",
    project: "TEST_PROJECT_SLUG"
  })],

  build: {
    sourcemap: true
  }
});