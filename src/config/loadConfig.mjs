import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import YAML from 'yaml';

export async function loadConfig(path) {
  const fullPath = resolve(path);
  const raw = await readFile(fullPath, 'utf8');
  const config = YAML.parse(raw);
  validateConfig(config, fullPath);
  return config;
}

function validateConfig(config, fullPath) {
  const required = ['id', 'name', 'policy', 'channels', 'tools', 'routes'];
  for (const key of required) {
    if (!config?.[key]) throw new Error(`Config ${fullPath} missing required key: ${key}`);
  }
  if (!Array.isArray(config.tools) || config.tools.length === 0) {
    throw new Error(`Config ${fullPath} must define at least one tool`);
  }
}
