const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const { DefinePlugin } = require('webpack');

module.exports = {
  mode: "production",
  entry: {
    "popup/popup": path.resolve(__dirname, "..", "src", "popup", "index.ts"),
    "../background": path.resolve(__dirname, "..", "src", "background.js"),  // ../ moves it up one level
    "../content-script": path.resolve(__dirname, "..", "src", "content-script.js"),
    "../main-world-script": path.resolve(__dirname, "..", "src", "main-world-script.js"),
  },
  output: {
    path: path.join(__dirname, "../dist/js"),
    filename: "[name].js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new DefinePlugin({
      'process.env': JSON.stringify(process.env),
    }),
    new CopyPlugin({
      patterns: [
        {from: ".", to: "../", context: "public"},
        {from: "src/popup.html", to: "../popup.html"},
        {from: "css", to: "../css"},
        {
          from: 'node_modules/tlsn-js/build',
          to: '../js',
          force: true,
        },
        {
          from: 'node_modules/tlsn-js/build/tlsn_wasm.js',
          to: '../',
          force: true,
        },
        {
          from: 'node_modules/tlsn-js/build/tlsn_wasm_bg.wasm',
          to: '../',
          force: true,
        },
        {
          from: 'node_modules/tlsn-js/build/snippets',
          to: '../snippets',
          force: true,
        },
      ]
    }),
  ],
};
