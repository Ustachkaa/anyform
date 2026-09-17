import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: path.join(os.tmpdir(), "anyform-test-data"),
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/anyform_test",
      FREE_CONVERSIONS: "10",
      FREE_QUOTA_PERIOD: "lifetime",
    },
    testTimeout: 20_000,
  },
});
