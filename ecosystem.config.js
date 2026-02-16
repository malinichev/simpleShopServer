module.exports = {
  apps: [
    {
      name: 'sports-shop-api',
      script: 'dist/main.js',
      cwd: '/var/www/sports-shop/current/server',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/www/sports-shop/logs/error.log',
      out_file: '/var/www/sports-shop/logs/out.log',
      merge_logs: true,
      // Restart policy
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '512M',
      watch: false,
    },
  ],

  deploy: {
    production: {
      user: 'deploy',
      host: '45.81.243.129',
      ref: 'origin/main',
      repo: 'git@github.com:malinichev/siteWithAdmin.git',
      path: '/var/www/sports-shop',
      'pre-deploy-local': '',
      'post-deploy':
        'cd server && npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /var/www/sports-shop/logs',
    },
  },
};
