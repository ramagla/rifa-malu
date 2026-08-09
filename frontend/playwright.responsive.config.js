import {
  defineConfig,
} from '@playwright/test'


export default defineConfig({
  testDir: './tests',

  testMatch:
    'responsive.spec.js',

  timeout: 120000,

  expect: {
    timeout: 10000,
  },

  fullyParallel: false,
  workers: 1,

  reporter: [
    ['list'],

    [
      'html',
      {
        outputFolder:
          'playwright-report-responsive',

        open: 'never',
      },
    ],
  ],

  use: {
    baseURL:
      'http://127.0.0.1:5174',

    headless: true,

    screenshot:
      'only-on-failure',

    trace:
      'retain-on-failure',

    video:
      'retain-on-failure',
  },

  webServer: [
    {
      command:
        'rm -f rifa-responsive-test.db rifa-responsive-test.db-shm rifa-responsive-test.db-wal && TURSO_DATABASE_URL=file:./rifa-responsive-test.db API_PORT=8011 node --env-file=.env.local scripts/local-api-server.mjs',

      url:
        'http://127.0.0.1:8011/api/public-event',

      reuseExistingServer:
        false,

      timeout:
        120000,
    },

    {
      command:
        'VITE_API_TARGET=http://127.0.0.1:8011 npm run dev -- --host 127.0.0.1 --port 5174',

      url:
        'http://127.0.0.1:5174',

      reuseExistingServer:
        false,

      timeout:
        120000,
    },
  ],
})
