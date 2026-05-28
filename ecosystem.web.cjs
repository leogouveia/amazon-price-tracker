module.exports = {
  apps: [
    {
      name: "amazon-web",

      script: "pnpm",
      args: "web",

      cwd: __dirname,

      autorestart: true,

      out_file: "./logs/web.out.log",
      error_file: "./logs/web.error.log",
    },
  ],
};
