import fs from 'fs-extra';
import path from 'path';
import { writeWithBackup } from './utils/file-system.js';

interface PostmanEnvironment {
  name: string;
  values: Array<{ key: string; value: string; enabled: boolean }>;
}

export function parsePostmanEnvironment(filePath: string): PostmanEnvironment {
  const content = fs.readJsonSync(filePath);
  // Allow slightly fuzzy matching as long as it looks like an environment
  if (content._postman_variable_scope !== 'environment' && !content.values) {
    throw new Error('Provided file does not appear to be a valid Postman Environment');
  }
  return { name: content.name, values: content.values };
}

export function toBrunoEnv(
  env: PostmanEnvironment,
  outputDir: string,
  backup: boolean = false,
  dryRun: boolean = false
) {
  const brunoEnv = {
    name: env.name,
    variables: env.values
      .filter(v => v.enabled !== false)
      .map(v => ({ name: v.key, value: v.value })),
  };
  const targetPath = path.join(outputDir, `${env.name.replace(/[^a-zA-Z0-9_-]/g, '-')}.json`);
  return writeWithBackup(targetPath, JSON.stringify(brunoEnv, null, 2), backup, dryRun);
}

export function toHoppscotchEnv(
  env: PostmanEnvironment,
  outputDir: string,
  backup: boolean = false,
  dryRun: boolean = false
) {
  const hoppEnv = {
    name: env.name,
    version: "1.0.0",
    variables: env.values
      .filter(v => v.enabled !== false)
      .map(v => ({ key: v.key, value: v.value })),
  };
  const targetPath = path.join(outputDir, `${env.name.replace(/[^a-zA-Z0-9_-]/g, '-')}-hoppscotch.json`);
  return writeWithBackup(targetPath, JSON.stringify(hoppEnv, null, 2), backup, dryRun);
}

