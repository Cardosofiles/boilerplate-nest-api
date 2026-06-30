// Webpack config for NestJS Hot Module Replacement (dev only).
// Used by: `nest build --webpack --webpackPath webpack-hmr.config.js --watch`.
// HMR swaps changed modules in the running process instead of killing and
// respawning it — so the HTTP server is never rebound and the port is never
// released, which sidesteps the EADDRINUSE / orphaned-process problem that
// `nest start --watch` hits inside the Docker dev container.
const nodeExternals = require('webpack-node-externals');
const { RunScriptWebpackPlugin } = require('run-script-webpack-plugin');

module.exports = function (options, webpack) {
  return {
    ...options,
    entry: ['webpack/hot/poll?100', options.entry],
    externals: [
      nodeExternals({
        allowlist: ['webpack/hot/poll?100'],
      }),
    ],
    // Bind mounts (Windows/macOS → Docker) don't deliver native fs events into
    // the container, so webpack must poll. The interval MUST be a number —
    // `WATCHPACK_POLLING=true` makes chokidar throw "interval must be of type
    // number". Setting it explicitly here is authoritative.
    watchOptions: {
      poll: 300,
      aggregateTimeout: 100,
      ignored: /node_modules/,
    },
    plugins: [
      ...options.plugins,
      new webpack.HotModuleReplacementPlugin(),
      new webpack.WatchIgnorePlugin({
        paths: [/\.js$/, /\.d\.ts$/],
      }),
      new RunScriptWebpackPlugin({
        name: options.output.filename,
        autoRestart: false,
      }),
    ],
  };
};
