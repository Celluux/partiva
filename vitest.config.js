import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["tests/**/*.test.{js,ts}"],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
