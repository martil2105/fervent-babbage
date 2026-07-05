import { defineConfig } from 'vitest/config';

// Unit tests target the app's pure logic (no DOM needed), so a plain node
// environment keeps them fast and dependency-free. Run with `npm test`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
