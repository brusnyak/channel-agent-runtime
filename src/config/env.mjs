import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

export function loadRuntimeEnv() {
  const paths = [
    resolve('.env'),
    resolve('../.env'),
    resolve('../../.env'),
  ];

  for (const path of paths) {
    if (existsSync(path)) {
      dotenv.config({ path, override: false, quiet: true });
    }
  }
}
