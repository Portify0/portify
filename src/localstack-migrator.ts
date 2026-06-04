import * as fs from "fs";
import * as path from "path";
import chalk from "chalk";
import { writeWithBackup } from "./utils/file-system.js";

interface LocalStackMigrateOptions {
  scanPath: string;
  autofix?: boolean;
  alternative?: "floci" | "ministack" | "moto";
  dryRun?: boolean;
  backup?: boolean;
}

interface LocalStackIssue {
  file: string;
  line: number;
  type: "image" | "auth-missing" | "v4-incompatibility" | "url";
  severity: "high" | "medium" | "info";
  message: string;
  snippet?: string;
}

interface LocalStackReport {
  issues: LocalStackIssue[];
  fixedCount: number;
  filesProcessed: number;
  filesModified: number;
  backupsCreated: string[];
}

export async function migrateLocalStack(options: LocalStackMigrateOptions): Promise<LocalStackReport> {
  const { scanPath, autofix = false, alternative = "floci", dryRun = false, backup = false } = options;
  const root = path.resolve(scanPath);
  const issues: LocalStackIssue[] = [];
  let fixedCount = 0;
  let filesModified = 0;
  const backupsCreated: string[] = [];

  const files = getFilesRecursive(root);

  for (const file of files) {
    const relativePath = path.relative(root, file);
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    let fileModified = false;
    const newLines = [...lines];

    const isDockerCompose = file.endsWith("docker-compose.yml") || file.endsWith("docker-compose.yaml");
    const isCIConfig = file.includes(".github/workflows") || file.includes(".gitlab-ci.yml") || file.includes("circle.yml");
    const isTestFile = file.includes("test") || file.includes("spec");
    const isEnvFile = path.basename(file).startsWith(".env");
    const isTerraform = file.endsWith(".tf") || file.endsWith(".tfvars");
    const isK8sManifest = (file.endsWith(".yaml") || file.endsWith(".yml")) && 
      (content.includes("apiVersion:") && content.includes("kind:"));
    const isPackageManifest = file.endsWith("package.json") || file.endsWith("pom.xml") || file.endsWith("go.mod") || file.endsWith("requirements.txt");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // 1. Scan for LocalStack image in docker-compose, CI config, or Kubernetes manifests
      if ((isDockerCompose || isCIConfig || isK8sManifest) && line.includes("image:") && line.includes("localstack/localstack")) {
        issues.push({
          file: relativePath,
          line: lineNum,
          type: "image",
          severity: "high",
          message: `Uses sunset/paid LocalStack image: "${line.trim()}". The Community Edition was sunsetted in March 2026.`,
          snippet: line.trim()
        });

        if (autofix) {
          const replacementImage = alternative === "floci" ? "floci/floci:latest"
            : alternative === "moto" ? "motoserver/moto:latest"
            : "ministack/ministack:latest";
          newLines[i] = line.replace(/localstack\/localstack.*/, replacementImage);
          fileModified = true;
          fixedCount++;
        }
      }

      // 2. Scan for missing LOCALSTACK_AUTH_TOKEN / authentication in CI
      if (isCIConfig && line.includes("localstack") && !content.includes("LOCALSTACK_AUTH_TOKEN")) {
        // Only trigger once per file to avoid noise
        if (!issues.some(iss => iss.file === relativePath && iss.type === "auth-missing")) {
          issues.push({
            file: relativePath,
            line: lineNum,
            type: "auth-missing",
            severity: "high",
            message: `LocalStack configuration in CI/CD pipeline lacks a LOCALSTACK_AUTH_TOKEN. Mandatory authentication went into effect on March 23, 2026.`,
            snippet: line.trim()
          });
        }
      }

      // 3. Scan for Testcontainers LocalStack usages in test files
      if (isTestFile && (line.includes("LocalStackContainer") || line.includes("localstack-container"))) {
        issues.push({
          file: relativePath,
          line: lineNum,
          type: "v4-incompatibility",
          severity: "medium",
          message: `References LocalStack Testcontainers configuration. Make sure to map environment variables or migrate to an open alternative.`,
          snippet: line.trim()
        });
      }

      // 4. Scan for localstack endpoints or localhost:4566 URLs
      if (!isTerraform && !isK8sManifest && (line.includes("http://localhost:4566") || line.includes("http://localstack:4566"))) {
        issues.push({
          file: relativePath,
          line: lineNum,
          type: "url",
          severity: "info",
          message: `References standard LocalStack port 4566. This is compatible with ${alternative}, but double-check resource tags and AWS limitations.`,
          snippet: line.trim()
        });
      }

      // 5. Scan .env files for LocalStack specific overrides
      if (isEnvFile && (line.includes("LOCALSTACK_HOSTNAME") || line.includes("AWS_ENDPOINT_URL"))) {
        issues.push({
          file: relativePath,
          line: lineNum,
          type: "url",
          severity: "medium",
          message: `Found LocalStack env vars in ${path.basename(file)}. Ensure it points to the correct open-source alternative.`,
          snippet: line.trim()
        });
        
        // Example fix: Just keep it as 4566 but format it properly if needed, 
        // Floci uses 4566, so no destructive edits needed, but we track it.
      }

      // 6. Scan Terraform configurations for LocalStack endpoints
      if (isTerraform && (line.includes("localstack") || line.includes("localhost:4566") || line.includes("localstack:4566"))) {
        if (line.includes("endpoint") || line.includes("endpoints") || line.includes("http://")) {
          issues.push({
            file: relativePath,
            line: lineNum,
            type: "url",
            severity: "medium",
            message: `Terraform configuration references LocalStack endpoint or port 4566. Ensure it points to the correct open-source alternative.`,
            snippet: line.trim()
          });
        }
      }

      // 7. Scan Kubernetes configurations for LocalStack host/endpoint overrides
      if (isK8sManifest && (line.includes("localstack") || line.includes("localhost:4566") || line.includes("localstack:4566"))) {
        if (line.includes("value:") || line.includes("http://")) {
          issues.push({
            file: relativePath,
            line: lineNum,
            type: "url",
            severity: "medium",
            message: `Kubernetes configuration references LocalStack endpoint or port 4566. Ensure it points to the correct open-source alternative.`,
            snippet: line.trim()
          });
        }
      }

      // 8. Scan for Testcontainers LocalStack dependencies in package manifests
      if (isPackageManifest && (line.includes("testcontainers-localstack") || line.includes("testcontainers/localstack") || line.includes("@testcontainers/localstack"))) {
        issues.push({
          file: relativePath,
          line: lineNum,
          type: "v4-incompatibility",
          severity: "medium",
          message: `Package manifest references LocalStack Testcontainers dependency. Ensure you migrate to a compatible open alternative.`,
          snippet: line.trim()
        });
      }
    }

    if (fileModified && autofix) {
      const writeRes = writeWithBackup(file, newLines.join("\n"), backup, dryRun);
      if (writeRes.fileModified) {
        filesModified++;
      }
      if (writeRes.backupCreated) {
        backupsCreated.push(writeRes.backupCreated);
      }
    }
  }

  return {
    issues,
    fixedCount,
    filesProcessed: files.length,
    filesModified,
    backupsCreated
  };
}

function getFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) {
    return [dir];
  }

  const list = fs.readdirSync(dir);
  for (const file of list) {
    if (file === "node_modules" || file === ".git" || file === "dist") continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results.push(...getFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}
