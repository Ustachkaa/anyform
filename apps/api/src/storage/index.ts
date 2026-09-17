import { config } from "../config.js";
import type { StorageDriver } from "./driver.js";
import { LocalStorage } from "./local.js";
import { S3Storage } from "./s3.js";

export type { StorageDriver } from "./driver.js";
export { buildKey, assertSafeKey } from "./driver.js";

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  if (config.STORAGE_DRIVER === "s3") {
    driver = new S3Storage({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      bucket: config.S3_BUCKET,
      accessKeyId: config.S3_ACCESS_KEY,
      secretAccessKey: config.S3_SECRET_KEY,
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
  } else {
    driver = new LocalStorage(config.STORAGE_LOCAL_DIR);
  }
  return driver;
}

/** Test hook. */
export function setStorage(d: StorageDriver | undefined): void {
  driver = d;
}
