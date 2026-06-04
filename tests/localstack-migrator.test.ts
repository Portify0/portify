import { expect, test, describe, beforeAll, afterAll } from 'vitest';
import { migrateLocalStack } from '../src/localstack-migrator';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('LocalStack Migrator', () => {
  const fixturesDir = path.join(__dirname, 'fixtures');
  const tempTestDir = path.join(__dirname, 'fixtures', 'temp-localstack-tests');

  beforeAll(() => {
    fs.ensureDirSync(tempTestDir);
  });

  afterAll(() => {
    fs.removeSync(tempTestDir);
  });

  test('scans and finds issues without applying fixes (dry-run/check mode)', async () => {
    // Copy realworld-docker-compose.yml to temp directory
    const testComposePath = path.join(tempTestDir, 'docker-compose.yml');
    fs.copySync(
      path.join(fixturesDir, 'realworld-docker-compose.yml'),
      testComposePath
    );

    // Create a mock .env file with LocalStack variables
    const testEnvPath = path.join(tempTestDir, '.env');
    fs.writeFileSync(
      testEnvPath,
      'LOCALSTACK_HOSTNAME=localhost\nAWS_ENDPOINT_URL=http://localhost:4566\n'
    );

    const report = await migrateLocalStack({
      scanPath: tempTestDir,
      autofix: false,
      dryRun: false
    });

    expect(report.issues.length).toBeGreaterThan(0);
    
    // Should find the image issue
    const imageIssue = report.issues.find(i => i.type === 'image');
    expect(imageIssue).toBeDefined();
    expect(imageIssue?.severity).toBe('high');
    expect(imageIssue?.snippet).toContain('localstack/localstack');

    // Should find the url issue from AWS_ENDPOINT_URL
    const urlIssues = report.issues.filter(i => i.type === 'url');
    expect(urlIssues.length).toBeGreaterThan(0);

    expect(report.fixedCount).toBe(0);

    // Verify file content did not change
    const composeContent = fs.readFileSync(testComposePath, 'utf-8');
    expect(composeContent).toContain('image: localstack/localstack:1.4.0');
  });

  test('applies autofixes correctly', async () => {
    // Clear temp dir and re-copy
    fs.emptyDirSync(tempTestDir);
    const testComposePath = path.join(tempTestDir, 'docker-compose.yml');
    fs.copySync(
      path.join(fixturesDir, 'realworld-docker-compose.yml'),
      testComposePath
    );

    const report = await migrateLocalStack({
      scanPath: tempTestDir,
      autofix: true,
      alternative: 'moto',
      dryRun: false
    });

    expect(report.fixedCount).toBe(1); // 1 docker image fixed

    // Verify compose content changed
    const composeContent = fs.readFileSync(testComposePath, 'utf-8');
    expect(composeContent).not.toContain('image: localstack/localstack:1.4.0');
    expect(composeContent).toContain('motoserver/moto:latest');
  });

  test('respects dryRun flag when autofix is enabled', async () => {
    fs.emptyDirSync(tempTestDir);
    const testComposePath = path.join(tempTestDir, 'docker-compose.yml');
    fs.copySync(
      path.join(fixturesDir, 'realworld-docker-compose.yml'),
      testComposePath
    );

    const report = await migrateLocalStack({
      scanPath: tempTestDir,
      autofix: true,
      alternative: 'floci',
      dryRun: true
    });

    expect(report.issues.length).toBeGreaterThan(0);

    // Verify compose content did NOT change because of dryRun
    const composeContent = fs.readFileSync(testComposePath, 'utf-8');
    expect(composeContent).toContain('image: localstack/localstack:1.4.0');
  });

  test('creates a backup file when backup is enabled and files are modified', async () => {
    fs.emptyDirSync(tempTestDir);
    const testComposePath = path.join(tempTestDir, 'docker-compose.yml');
    fs.copySync(
      path.join(fixturesDir, 'realworld-docker-compose.yml'),
      testComposePath
    );

    const report = await migrateLocalStack({
      scanPath: tempTestDir,
      autofix: true,
      alternative: 'ministack',
      dryRun: false,
      backup: true
    });

    expect(report.fixedCount).toBe(1);
    expect(report.backupsCreated.length).toBe(1);
    expect(report.filesModified).toBe(1);

    const backupPath = report.backupsCreated[0];
    expect(fs.existsSync(backupPath)).toBe(true);

    // Backup should contain the original content
    const backupContent = fs.readFileSync(backupPath, 'utf-8');
    expect(backupContent).toContain('image: localstack/localstack:1.4.0');

    // Original file should be updated
    const originalContent = fs.readFileSync(testComposePath, 'utf-8');
    expect(originalContent).toContain('ministack/ministack:latest');
  });

  test('scans and finds LocalStack endpoints in Terraform files (.tf)', async () => {
    fs.emptyDirSync(tempTestDir);
    const tfPath = path.join(tempTestDir, 'main.tf');
    fs.writeFileSync(
      tfPath,
      `
      provider "aws" {
        region = "us-east-1"
        endpoints {
          s3 = "http://localstack:4566"
          dynamodb = "http://localhost:4566"
        }
      }
      `
    );

    const report = await migrateLocalStack({
      scanPath: tempTestDir,
      autofix: false,
      dryRun: false
    });

    expect(report.issues.length).toBe(2);
    expect(report.issues[0].type).toBe('url');
    expect(report.issues[0].file).toBe('main.tf');
    expect(report.issues[0].message).toContain('Terraform configuration references LocalStack endpoint');
  });

  test('scans and fixes Kubernetes manifests (.yaml)', async () => {
    fs.emptyDirSync(tempTestDir);
    const k8sPath = path.join(tempTestDir, 'deployment.yaml');
    fs.writeFileSync(
      k8sPath,
      `
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: aws-services
      spec:
        template:
          spec:
            containers:
            - name: localstack
              image: localstack/localstack:2.0.0
              env:
              - name: AWS_ENDPOINT_URL
                value: http://localstack:4566
      `
    );

    const report = await migrateLocalStack({
      scanPath: tempTestDir,
      autofix: true,
      alternative: 'moto',
      dryRun: false
    });

    expect(report.issues.length).toBe(2);
    expect(report.fixedCount).toBe(1); // The image was fixed
    expect(report.issues[0].type).toBe('image');
    expect(report.issues[1].type).toBe('url');
    expect(report.issues[1].message).toContain('Kubernetes configuration references LocalStack endpoint');

    const updatedContent = fs.readFileSync(k8sPath, 'utf-8');
    expect(updatedContent).toContain('image: motoserver/moto:latest');
  });

  test('scans and flags Testcontainers dependencies in package.json', async () => {
    fs.emptyDirSync(tempTestDir);
    const packageJsonPath = path.join(tempTestDir, 'package.json');
    fs.writeFileSync(
      packageJsonPath,
      JSON.stringify({
        name: 'test-app',
        dependencies: {
          '@testcontainers/localstack': '^1.0.0'
        }
      }, null, 2)
    );

    const report = await migrateLocalStack({
      scanPath: tempTestDir,
      autofix: false,
      dryRun: false
    });

    expect(report.issues.length).toBe(1);
    expect(report.issues[0].type).toBe('v4-incompatibility');
    expect(report.issues[0].message).toContain('Package manifest references LocalStack Testcontainers dependency');
  });
});
