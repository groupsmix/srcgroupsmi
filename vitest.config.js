import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/e2e/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      thresholds: {
        'functions/api/lemonsqueezy-webhook.js': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'functions/api/coins-wallet.js': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'functions/api/account/delete.js': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'functions/api/_shared/webhook-verify.js': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'functions/api/_shared/auth.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'functions/api/_shared/rate-limit.ts': {
          statements: 90,
          branches: 90,
          functions: 90,
          lines: 90
        },
        'functions/api/_shared/**': {
          statements: 75,
          branches: 75,
          functions: 75,
          lines: 75
        },
        'functions/api/*.js': {
          statements: 60,
          branches: 60,
          functions: 60,
          lines: 60
        },
        'functions/api/*.ts': {
          statements: 60,
          branches: 60,
          functions: 60,
          lines: 60
        }
      }
    }
  }
});