import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'utils/**/*.ts',
        'hooks/**/*.ts',
        'components/dev/**/*.tsx',
        'engine/core/EngineRuntime.ts',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.test.tsx',
        '**/*.spec.tsx',
        '**/tests/**',
        '**/node_modules/**',
        'utils/benchmarks/**', // Covered by integration tests
        'utils/dev/performanceAPI.ts', // Manual testing tool
      ],
      // Strict thresholds for 100% quality
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
    // Performance settings
    testTimeout: 10000,
    hookTimeout: 10000,
    // Parallelization
    maxConcurrency: 5,
    // Reporting
    reporters: ['verbose', 'html'],
    outputFile: {
      html: './coverage/test-report.html',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
