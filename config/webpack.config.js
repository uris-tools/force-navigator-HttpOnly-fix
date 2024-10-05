'use strict';

const { merge } = require('webpack-merge');

const common = require('./webpack.common.js');
const PATHS = require('./paths');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');

// Merge webpack configuration files
module.exports = (env, argv) => {
	console.log('Target Browser: ', env.BROWSER);

	// Determine the manifest file based on the target browser
	let manifestFile;
	switch (env.BROWSER) {
		case 'CHROME':
			manifestFile = 'manifest.chrome.json';
			break;
		case 'FIREFOX':
			manifestFile = 'manifest.firefox.json';
			break;
		default:
			throw new Error('Unsupported browser: ' + env.BROWSER);
	}

	return merge(common, {
		entry: {
			popup: PATHS.src + '/popup.js',
			contentScript: PATHS.src + '/contentScript.js',
			serviceWorker: PATHS.src + '/serviceWorker.js',
			shared: PATHS.src + '/shared.js',
		},
		devtool: 'source-map',
		plugins: [
			//expose TARGET BROWSER to the JS code
			new webpack.DefinePlugin({
				__BROWSER__: JSON.stringify(env.BROWSER),
			}),
			new CopyWebpackPlugin({
				patterns: [{ from: PATHS.public + `/${manifestFile}`, to: 'manifest.json' }],
			}),
		],
	});
};
