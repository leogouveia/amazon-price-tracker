const path = require("node:path");

const tsx = path.join(
  __dirname,
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs"
);

module.exports = {
  apps: [
    {
      name: "amazon-api",
      script: path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs"),
      args: "src/server.ts",
      interpreter: "node",
      cwd: __dirname,
      autorestart: true,
      out_file: "./logs/api.out.log",
      error_file: "./logs/api.error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
