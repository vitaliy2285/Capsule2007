require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'capsule2007-api',
      script: 'server.js',
      cwd: '/var/www/capsule2007',
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production',
        PORT: process.env.PORT || 3000,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        YOOKASSA_SHOP_ID: process.env.YOOKASSA_SHOP_ID,
        YOOKASSA_SECRET_KEY: process.env.YOOKASSA_SECRET_KEY,
        SITE_URL: process.env.SITE_URL,
        ADMIN_TOKEN: process.env.ADMIN_TOKEN
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      time: true
    }
  ]
};
