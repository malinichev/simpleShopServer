module.exports = {
  apps: [
    {
      name: 'simple-shop-api',
      script: 'dist/main.js',
      cwd: '/var/www/simple-shop-server/current',
      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/var/www/simple-shop-server/logs/error.log',
      out_file: '/var/www/simple-shop-server/logs/out.log',
      merge_logs: true,
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
      repo: 'git@github-server:malinichev/simpleShopServer.git',
      path: '/var/www/simple-shop-server',
      'pre-deploy-local': '',
      'post-deploy':
        'pnpm install --frozen-lockfile && pnpm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'mkdir -p /var/www/simple-shop-server/logs',
    },
  },
};
