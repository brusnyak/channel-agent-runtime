import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function createJsonlStore(path = 'data/events.jsonl') {
  const filePath = resolve(path);
  return {
    async append(event) {
      await mkdir(dirname(filePath), { recursive: true });
      await appendFile(filePath, `${JSON.stringify(event)}\n`);
    },
    async readAll() {
      try {
        const raw = await readFile(filePath, 'utf8');
        return raw
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      } catch (error) {
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    },
    path: filePath,
  };
}
