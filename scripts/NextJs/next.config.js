const {
  NEXT_PUBLIC_SENTRY_DSN,
  VERCEL_GITHUB_COMMIT_SHA,
  VERCEL_GITLAB_COMMIT_SHA,
  VERCEL_BITBUCKET_COMMIT_SHA,
  SENTRY_URL,
  SENTRY_ORG,
  SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN,
} = process.env;
const SENTRY_DSN = process.env.SENTRY_DSN || NEXT_PUBLIC_SENTRY_DSN;

const COMMIT_SHA =
  VERCEL_GITHUB_COMMIT_SHA ||
  VERCEL_GITLAB_COMMIT_SHA ||
  VERCEL_BITBUCKET_COMMIT_SHA;

const SentryWebpackPlugin = require('@sentry/webpack-plugin');
const fs = require('fs');

// We require this to fake that our plugin matches the next version
function replaceVersion() {
  const packageJson = require('./package.json');
  if (
    packageJson &&
    packageJson.dependencies &&
    packageJson.dependencies.next
  ) {
    const packagePluginPath = `./node_modules/@sentry/next-plugin-sentry/package.json`;
    const packagePlugin = require(packagePluginPath);
    packagePlugin.version = packageJson.dependencies.next;
    fs.writeFileSync(packagePluginPath, JSON.stringify(packagePlugin));
  } else {
    console.error(`Can't find 'next' dependency`);
  }
}
replaceVersion();

const basePath = '';

module.exports = {
  experimental: { plugins: true },
  env: {
    SENTRY_DSN: SENTRY_DSN || '___DSN___',
    // Make the COMMIT_SHA available to the client so that Sentry events can be
    // marked for the release they belong to. It may be undefined if running
    // outside of Vercel
    NEXT_PUBLIC_COMMIT_SHA: COMMIT_SHA,
  },
  plugins: ['@sentry/next-plugin-sentry'],
  // Sentry.init config for server-side code, serializable values only.
  // See more in https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/custom-init/
  serverRuntimeConfig: {
    sentry: {
      // debug: true,
    },
  },
  // Sentry.init config for client-side code (and fallback for server-side),
  // serializeable values only. See more in https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/custom-init/
  publicRuntimeConfig: {
    sentry: {
      // debug: true,
    },
  },
  productionBrowserSourceMaps: true,
  webpack: (config, { dev }) => {
    if (!dev) {
      // Enable high-quality source-maps for non-dev builds. See
      // https://github.com/vercel/next.js/blob/master/errors/improper-devtool.md
      config.devtool = 'source-map';
    }
    config.plugins.push(
      new SentryWebpackPlugin({
        // Sentry project config
        // Environment variables have priority over the properties file
        url: SENTRY_URL,
        org: SENTRY_ORG,
        project: SENTRY_PROJECT,
        authToken: SENTRY_AUTH_TOKEN,
        configFile: 'sentry.properties',
        // webpack specific configuration
        stripPrefix: ['webpack://_N_E/'],
        urlPrefix: `~${basePath}/_next`,
        include: '.next/',
        ignore: ['node_modules', 'webpack.config.js'],
        // dryRun in non-production environments
        dryRun: dev,
        release: COMMIT_SHA,
      }),
    );
    return config;
  },
  basePath,
};
