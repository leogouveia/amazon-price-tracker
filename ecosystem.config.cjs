const path = require("node:path");

module.exports = {
    apps: [
        {
            name: "amazon-monitor",
            script: path.join(__dirname, "node_modules", "tsx", "dist", "cli.mjs"),
            args: "src/index.ts",
            interpreter: "node",

            cwd: __dirname,

            // roda todo dia às 09:00
            cron_restart: "0 9 * * *",

            // não reinicia sozinho depois que terminar
            autorestart: false,

            // logs
            out_file: "./logs/out.log",
            error_file: "./logs/error.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss",

            // ambiente
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};