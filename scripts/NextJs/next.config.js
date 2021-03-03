const SentryWebpackPlugin = require('@sentry/webpack-plugin');
const fs = require('fs');

// We require this to fake that our plugin matches the next version
function replaceVersion() {
  const package = require('./package.json');
  if (package && package.dependencies && package.dependencies.next) {
    const packagePluginPath = `./node_modules/@sentry/next-plugin-sentry/package.json`;
    const packagePlugin = require(packagePluginPath);
    packagePlugin.version = package.dependencies.next;
    fs.writeFileSync(packagePluginPath, JSON.stringify(packagePlugin));
  } else {
    console.error(`Can't find 'next' dependency`);
  }
}
replaceVersion();

module.exports = {
  experimental: { plugins: true },
  env: {
    SENTRY_DSN: '___DSN___',
  },
  plugins: ['@sentry/next-plugin-sentry'],
  // Sentry.init config for server-side code. Can accept any available config option.
  serverRuntimeConfig: {
    sentry: {
      type: 'server',
      // debug: true,
    },
  },
  // Sentry.init config for client-side code (and fallback for server-side)
  // can accept only serializeable values. For more granular control see below.
  publicRuntimeConfig: {
    sentry: {
      type: 'client',
      // debug: true,
    },
  },
  productionBrowserSourceMaps: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.plugins.push(
      new SentryWebpackPlugin({
        // Sentry project config
        configFile: 'sentry.properties',
        // webpack specific configuration
        urlPrefix: '~/_next/',
        include: ['.next/', '.'],
        ignore: ['node_modules', 'webpack.config.js'],
        // dryRun in non-production environments
        dryRun: dev,
      }),
    );
    return config;
  },
};
