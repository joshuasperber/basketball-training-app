import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const tailwindcssPath = path.join(projectRoot, "node_modules/tailwindcss");

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
    resolveAlias: {
      tailwindcss: tailwindcssPath,
    },
  },
  webpack: (config) => {
    config.resolve ??= {};
    config.resolve.alias = {
      ...config.resolve.alias,
      tailwindcss: tailwindcssPath,
    };
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
});
