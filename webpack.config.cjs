const path = require('path');

module.exports = [
  {
    name: 'popup',
    entry: './src/scripts/script.js',
    output: {
      path: path.resolve(__dirname, 'dist/scripts'),
      filename: 'script.js',
    },
    target: 'web',
    mode: 'production',
    devtool: false,
    resolve: { extensions: ['.js'] },
  },
  {
    name: 'signin',
    entry: './src/scripts/signin.js',
    output: {
      path: path.resolve(__dirname, 'dist/scripts'),
      filename: 'signin.js',
    },
    target: 'web',
    mode: 'production',
    devtool: false,
    resolve: { extensions: ['.js'] },
  },
  {
    name: 'settings',
    entry: './src/scripts/forms.js',
    output: {
      path: path.resolve(__dirname, 'dist/scripts'),
      filename: 'forms.js',
    },
    target: 'web',
    mode: 'production',
    devtool: false,
    resolve: { extensions: ['.js'] },
  },
  {
    name: 'background',
    entry: './src/scripts/background.js',
    output: {
      path: path.resolve(__dirname, 'dist/scripts'),
      filename: 'background.js',
    },
    target: 'webworker',
    mode: 'production',
    devtool: false,
    resolve: { extensions: ['.js'] },
  },
];
