const SentryWebpackPlugin = require('@sentry/webpack-plugin');

function isProdEnvironment() {
  if (
    process.env.NODE_ENV !== undefined &&
    process.env.NODE_ENV === 'production'
  ) {
    return true;
  } else {
    console.log('[Sentry] Not a production environment, dry-run is on.');
    return false;
  }
}

module.exports = {
  productionBrowserSourceMaps: true,
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    config.plugins.push(
      new SentryWebpackPlugin({
        // Sentry project config
        configFile: 'sentry.properties',

        // webpack specific configuration
        urlPrefix: '~/_next/',
        include: '.next/',
        ignore: ['node_modules', 'webpack.config.js'],

        // dryRun in non-production environments
        dryRun: !isProdEnvironment(),
      }),
    );
    return config;
  },
};
