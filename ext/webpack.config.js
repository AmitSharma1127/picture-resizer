const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
	entry: {
		background: "./src/background.js",
		popup: "./src/popup.js",
		auth: "./src/auth.js"
	},
	output: {
		filename: "[name].js",
		path: path.resolve(__dirname, "dist"),
		clean: true
	},
	mode: "production",
	plugins: [
		new CopyPlugin({
			patterns: [
				{ from: "public", to: "." },
				{ from: "assets", to: "assets" },
				{ from: "styles", to: "styles" }
			]
		})
	]
};
