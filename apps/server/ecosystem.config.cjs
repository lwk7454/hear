module.exports = {
  apps: [{
    name: "server",
    script: "./dist/index.js",
    instances: 1,
    exec_mode: "cluster",
    env: {
      NODE_ENV: "production",
    },
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    merge_logs: true,
  }]
}
