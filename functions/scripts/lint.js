// Cross-platform lint entry: the repo root has a flat eslint.config.js, which ESLint 8 would pick up,
// so eslintrc mode is forced here instead of via a POSIX-only env prefix in package.json.
process.env.ESLINT_USE_FLAT_CONFIG = "false";
process.argv.push("-c", ".eslintrc.js", "--ext", ".ts", "src/");
require(require("path").join(__dirname, "..", "node_modules", "eslint", "bin", "eslint.js"));
