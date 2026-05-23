module.exports = {
  apps: [
    {
      name: 'capsule2007-api',
      script: 'server.js',
      cwd: '/var/www/capsule2007',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      time: true
    }
  ]
};
