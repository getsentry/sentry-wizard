const SentryWebpackPlugin = require('@sentry/webpack-plugin');

module.exports = {
  productionBrowserSourceMaps: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.plugins.push(
      new SentryWebpackPlugin({
        // sentry-cli configuration
        authToken: process.env.SENTRY_AUTH_TOKEN,
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        // webpack specific configuration
        urlPrefix: '~/_next/',
        include: '.next/',
        ignore: ['node_modules', 'webpack.config.js'],
        dryRun: true, // useful for dev environments; set to false in production
      }),
    );
    return config;
  },
};
