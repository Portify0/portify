import { expect, test, describe, afterAll } from 'vitest';
import { parsePostmanEnvironment, toBrunoEnv, toHoppscotchEnv } from '../src/environment-migrator';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('Environment Migrator', () => {
  const sampleEnvPath = path.join(__dirname, 'fixtures', 'sample-env.json');
  const outputDir = path.join(__dirname, 'fixtures', 'output-envs');

  afterAll(() => {
    fs.removeSync(sampleEnvPath);
    fs.removeSync(outputDir);
  });

  // Setup sample environment file
  fs.ensureDirSync(path.join(__dirname, 'fixtures'));
  fs.writeJsonSync(sampleEnvPath, {
    id: "uuid",
    name: "Production Env",
    values: [
      { key: "API_KEY", value: "secret123", enabled: true },
      { key: "DEBUG", value: "false", enabled: false }
    ],
    _postman_variable_scope: "environment",
    _postman_exported_at: "2026-06-04T12:00:00.000Z",
    _postman_exported_using: "Postman/10.0.0"
  });

  test('parses Postman environment successfully', () => {
    const env = parsePostmanEnvironment(sampleEnvPath);
    expect(env.name).toBe("Production Env");
    expect(env.values).toHaveLength(2);
  });

  test('converts to Bruno environment format', () => {
    const env = parsePostmanEnvironment(sampleEnvPath);
    toBrunoEnv(env, outputDir);

    const brunoFilePath = path.join(outputDir, 'Production-Env.json');
    expect(fs.existsSync(brunoFilePath)).toBe(true);

    const brunoContent = fs.readJsonSync(brunoFilePath);
    expect(brunoContent.name).toBe("Production Env");
    // Should filter out disabled variables based on our logic (wait, we check explicit `enabled !== false` in our source)
    expect(brunoContent.variables).toHaveLength(1);
    expect(brunoContent.variables[0].name).toBe("API_KEY");
    expect(brunoContent.variables[0].value).toBe("secret123");
  });

  test('converts to Hoppscotch environment format', () => {
    const env = parsePostmanEnvironment(sampleEnvPath);
    toHoppscotchEnv(env, outputDir);

    const hoppFilePath = path.join(outputDir, 'Production-Env-hoppscotch.json');
    expect(fs.existsSync(hoppFilePath)).toBe(true);

    const hoppContent = fs.readJsonSync(hoppFilePath);
    expect(hoppContent.name).toBe("Production Env");
    expect(hoppContent.variables).toHaveLength(1);
    expect(hoppContent.variables[0].key).toBe("API_KEY");
  });

  test('creates a backup file for environment variables when backup is enabled and output file exists', () => {
    const env = parsePostmanEnvironment(sampleEnvPath);
    toBrunoEnv(env, outputDir, false, false);
    const brunoFilePath = path.join(outputDir, 'Production-Env.json');
    expect(fs.existsSync(brunoFilePath)).toBe(true);

    const envModified = {
      name: env.name,
      values: [
        { key: "API_KEY", value: "newSecret", enabled: true }
      ]
    };

    const res = toBrunoEnv(envModified, outputDir, true, false);
    expect(res.fileModified).toBe(true);
    expect(res.backupCreated).toBeDefined();
    expect(fs.existsSync(res.backupCreated!)).toBe(true);

    if (res.backupCreated) fs.removeSync(res.backupCreated);
    fs.removeSync(brunoFilePath);
  });
});
