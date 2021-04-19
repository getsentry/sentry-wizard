// This file sets a custom webpack configuration to use your Next.js app
// with Sentry.
// https://nextjs.org/docs/api-reference/next.config.js/introduction
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

const SentryWebpackPlugin = require('@sentry/webpack-plugin');
const fs = require('fs');

const {
  VERCEL_GITHUB_COMMIT_SHA,
  VERCEL_GITLAB_COMMIT_SHA,
  VERCEL_BITBUCKET_COMMIT_SHA,
  SENTRY_URL,
  SENTRY_ORG,
  SENTRY_PROJECT,
  SENTRY_AUTH_TOKEN,
  SENTRY_RELEASE,
} = process.env;

function getSentryRelease() {
  return (
    SENTRY_RELEASE ||
    VERCEL_GITHUB_COMMIT_SHA ||
    VERCEL_GITLAB_COMMIT_SHA ||
    VERCEL_BITBUCKET_COMMIT_SHA
  );
}

// Next.js requires a plugin's version to match the Next.js version, so we fake
// it here by rewriting our plugin's package.json
function syncSentryPluginVersion() {
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
syncSentryPluginVersion();

module.exports = {
  experimental: { plugins: true },
  plugins: ['@sentry/next-plugin-sentry'],
  productionBrowserSourceMaps: true,
  webpack: (config, { dev }) => {
    if (!dev) {
      // Enable high-quality source-maps for non-dev builds. See
      // https://github.com/vercel/next.js/blob/master/errors/improper-devtool.md
      config.devtool = 'source-map';
    }
    config.plugins.push(
      new SentryWebpackPlugin({
        release: getSentryRelease(),
        url: SENTRY_URL,
        org: SENTRY_ORG,
        project: SENTRY_PROJECT,
        authToken: SENTRY_AUTH_TOKEN,
        configFile: 'sentry.properties',
        stripPrefix: ['webpack://_N_E/'],
        urlPrefix: `~/_next`,
        include: '.next/',
        ignore: ['node_modules', 'webpack.config.js'],
        dryRun: dev,
        // for all available options, see
        // https://github.com/getsentry/sentry-webpack-plugin#options
      }),
    );
    return config;
  },
};
