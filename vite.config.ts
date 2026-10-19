import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import testFiles from './test-files.json'

const testInclude = testFiles.roots.flatMap((root) =>
  testFiles.suffixes.map((suffix) => `${root}/**/*.${suffix}`),
)

export default defineConfig({
  base: '/kumiko-grid/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: testInclude,
    coverage: {
      provider: 'v8',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: [...testInclude, 'src/test/**', '**/*.d.ts', '**/*.typecheck.ts'],
      reportsDirectory: 'coverage',
      reporter: ['text', 'json-summary', ['html', { subdir: 'html' }]],
    },
  },
})
