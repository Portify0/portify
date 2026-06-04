import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { migratePostmanCollection } from '../src/postman-migrator';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('Postman Migrator', () => {
  const collectionPath = path.join(__dirname, 'fixtures', 'postman-collection.json');
  const codebasePath = path.join(__dirname, 'fixtures');
  const outputDir = path.join(__dirname, 'fixtures', 'out');

  beforeAll(() => {
    fs.ensureDirSync(outputDir);
  });

  afterAll(() => {
    fs.removeSync(outputDir);
  });

  test('migrates successfully to Bruno format', async () => {
    const report = await migratePostmanCollection({
      collectionPath,
      target: 'bruno',
      outputDir,
      scanCodebase: true,
      codebasePath,
      dryRun: false
    });

    expect(report.variableCount).toBe(0);
    expect(report.scriptConversions).toBeGreaterThan(0);
    expect(report.orphanedRequests).toHaveLength(1);
    expect(report.orphanedRequests[0]).toContain('DELETE Legacy Endpoint');

    // Verify files were generated
    const brunoColPath = path.join(outputDir, 'sample-api-collection');
    expect(fs.existsSync(path.join(brunoColPath, 'bruno.json'))).toBe(true);

    const folderBruPath = path.join(brunoColPath, 'user-authentication', 'folder.bru');
    expect(fs.existsSync(folderBruPath)).toBe(true);
    const folderContent = fs.readFileSync(folderBruPath, 'utf-8');
    expect(folderContent).toContain('name: "User Authentication"');

    const loginBruPath = path.join(brunoColPath, 'user-authentication', 'login-user.bru');
    expect(fs.existsSync(loginBruPath)).toBe(true);
    const loginContent = fs.readFileSync(loginBruPath, 'utf-8');
    expect(loginContent).toContain('name: "Login User"');
    expect(loginContent).toContain('post {');
    expect(loginContent).toContain('body: json');
    expect(loginContent).toContain('test("Status code is 200"');
    expect(loginContent).toContain('expect(res.status).to.equal(200)');
    expect(loginContent).toContain('res.body');
    expect(loginContent).toContain('bru.setEnvVar("authToken"');
  });

  test('migrates successfully to Hoppscotch format', async () => {
    const report = await migratePostmanCollection({
      collectionPath,
      target: 'hoppscotch',
      outputDir,
      scanCodebase: false,
      dryRun: false
    });

    const hoppImportPath = path.join(outputDir, 'hoppscotch-import.json');
    expect(fs.existsSync(hoppImportPath)).toBe(true);

    const content = fs.readJsonSync(hoppImportPath);
    expect(content.info.name).toBe('Sample API Collection');

    // Hoppscotch variables should be mapped to <<baseUrl>>
    const loginRequest = content.item[0].item[0].request;
    expect(loginRequest.url.raw).toContain('<<baseUrl>>');

    // Converted scripts
    const loginEvent = content.item[0].item[0].event[0];
    const scriptLines = loginEvent.script.exec.join('\n');
    expect(scriptLines).toContain('pw.test("Status code is 200"');
    expect(scriptLines).toContain('pw.expect(pw.response.status).toBe(200)');
    expect(scriptLines).toContain('pw.response.body');
    expect(scriptLines).toContain('pw.env.set("authToken"');
  });

  test('respects dryRun parameter without writing files', async () => {
    // Clear outputDir first
    fs.emptyDirSync(outputDir);

    const report = await migratePostmanCollection({
      collectionPath,
      target: 'bruno',
      outputDir,
      scanCodebase: false,
      dryRun: true
    });

    expect(report.outputPaths.length).toBeGreaterThan(0);
    // Ensure no files were actually written to outputDir
    const files = fs.readdirSync(outputDir);
    expect(files).toHaveLength(0);
  });

  test('detects complex auth types like oauth2 and awssig and reports warnings', async () => {
    const tempCollectionPath = path.join(outputDir, 'temp-auth-collection.json');
    const mockCollection = {
      info: {
        name: 'Auth Test Collection',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      item: [
        {
          name: 'OAuth2 Request',
          request: {
            method: 'GET',
            url: 'https://api.example.com/oauth-test',
            auth: {
              type: 'oauth2',
              oauth2: [
                { key: 'grant_type', value: 'client_credentials', type: 'string' },
                { key: 'accessTokenUrl', value: 'https://auth.example.com/token', type: 'string' }
              ]
            }
          }
        },
        {
          name: 'AWS Signature Request',
          request: {
            method: 'POST',
            url: 'https://api.example.com/aws-test',
            auth: {
              type: 'awssig',
              awssig: [
                { key: 'region', value: 'us-west-2', type: 'string' },
                { key: 'service', value: 's3', type: 'string' }
              ]
            }
          }
        }
      ]
    };

    fs.writeJsonSync(tempCollectionPath, mockCollection);

    const report = await migratePostmanCollection({
      collectionPath: tempCollectionPath,
      target: 'bruno',
      outputDir,
      scanCodebase: false,
      dryRun: true,
      authWarningAsError: false
    });

    expect(report.warnings.length).toBe(2);
    expect(report.warnings[0]).toContain('Complex auth "oauth2" detected');
    expect(report.warnings[0]).toContain('client_credentials');
    expect(report.warnings[0]).toContain('https://auth.example.com/token');
    
    expect(report.warnings[1]).toContain('Complex auth "awssig" detected');
    expect(report.warnings[1]).toContain('us-west-2');
    expect(report.warnings[1]).toContain('s3');

    // Should throw error when strict CI mode enabled
    await expect(
      migratePostmanCollection({
        collectionPath: tempCollectionPath,
        target: 'bruno',
        outputDir,
        scanCodebase: false,
        dryRun: true,
        authWarningAsError: true
      })
    ).rejects.toThrow('Authentication warnings detected in CI strict mode');

    fs.removeSync(tempCollectionPath);
  });

  test('migrates collection variables to Bruno environment file and Hoppscotch environment file', async () => {
    const tempCollectionPath = path.join(outputDir, 'temp-vars-collection.json');
    const mockCollection = {
      info: {
        name: 'Vars Test Collection',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
      },
      variable: [
        { key: 'baseUrl', value: 'https://api.example.com', type: 'string' },
        { key: 'timeout', value: '5000', type: 'string' }
      ],
      item: [
        {
          name: 'Simple Request',
          request: {
            method: 'GET',
            url: '{{baseUrl}}/test'
          }
        }
      ]
    };

    fs.writeJsonSync(tempCollectionPath, mockCollection);

    // 1. Verify Bruno Conversion
    const brunoReport = await migratePostmanCollection({
      collectionPath: tempCollectionPath,
      target: 'bruno',
      outputDir,
      scanCodebase: false,
      dryRun: false
    });

    expect(brunoReport.variableCount).toBeGreaterThanOrEqual(2);
    const envPath = path.join(outputDir, 'vars-test-collection', 'environments', 'collection-variables.bru');
    expect(fs.existsSync(envPath)).toBe(true);
    const envContent = fs.readFileSync(envPath, 'utf-8');
    expect(envContent).toContain('baseUrl: https://api.example.com');
    expect(envContent).toContain('timeout: 5000');

    // 2. Verify Hoppscotch Conversion
    const hoppReport = await migratePostmanCollection({
      collectionPath: tempCollectionPath,
      target: 'hoppscotch',
      outputDir,
      scanCodebase: false,
      dryRun: false
    });

    const hoppEnvPath = path.join(outputDir, 'hoppscotch-collection-vars.json');
    expect(fs.existsSync(hoppEnvPath)).toBe(true);
    const hoppEnv = fs.readJsonSync(hoppEnvPath);
    expect(hoppEnv.name).toBe('Collection Variables');
    expect(hoppEnv.variables[0].key).toBe('baseUrl');
    expect(hoppEnv.variables[0].value).toBe('https://api.example.com');

    fs.removeSync(tempCollectionPath);
  });
});
