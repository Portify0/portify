import { expect, test, describe, beforeAll, afterAll } from "vitest";
import { generateMigrationReport } from "../src/reporter.js";
import * as fs from "fs-extra";
import * as path from "path";

describe("Migration Reporter", () => {
  const tempReportDir = path.join(__dirname, "fixtures", "temp-reporter-tests");

  beforeAll(() => {
    fs.ensureDirSync(tempReportDir);
  });

  afterAll(() => {
    fs.removeSync(tempReportDir);
  });

  test("generates and saves correct JSON and Markdown reports", () => {
    const reportData = {
      timestamp: new Date().toISOString(),
      type: "localstack" as const,
      dryRun: false,
      backup: true,
      status: "failure" as const,
      summary: "Found 1 deprecation issue.",
      stats: {
        filesProcessed: 3,
        filesCreated: 0,
        filesModified: 1,
        issuesFound: 1,
        issuesFixed: 1
      },
      details: {
        issues: [
          {
            file: "docker-compose.yml",
            line: 12,
            type: "image",
            severity: "high",
            message: "Uses deprecated localstack image.",
            snippet: "image: localstack/localstack",
            fixed: true
          }
        ],
        backupsCreated: ["/path/to/docker-compose.yml.portify-backup-12345"]
      }
    };

    const { jsonPath, mdPath } = generateMigrationReport(reportData, tempReportDir);

    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);

    const savedJson = fs.readJsonSync(jsonPath);
    expect(savedJson.stats.issuesFound).toBe(1);
    expect(savedJson.details.issues[0].file).toBe("docker-compose.yml");

    const savedMd = fs.readFileSync(mdPath, "utf-8");
    expect(savedMd).toContain("# ⚠️ Portify Migration Report");
    expect(savedMd).toContain("Found 1 deprecation issue.");
    expect(savedMd).toContain("docker-compose.yml.portify-backup-12345");
  });
});
