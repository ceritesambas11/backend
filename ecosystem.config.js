module.exports = {
  apps: [
    {
      name: "indiego-backend",
      script: "./server.js",
      env: {
        TZ: "Asia/Jakarta",
        NODE_ENV: "production",
      },
    },
  ],
};

