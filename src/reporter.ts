import * as fs from "fs-extra";
import * as path from "path";
import chalk from "chalk";
import * as logger from "./logger.js";

export interface MigrationReportData {
  timestamp: string;
  type: "postman" | "localstack";
  dryRun: boolean;
  backup: boolean;
  status: "success" | "failure";
  summary: string;
  stats: {
    filesProcessed: number;
    filesCreated: number;
    filesModified: number;
    issuesFound: number;
    issuesFixed: number;
    variableCount?: number;
    scriptConversions?: number;
  };
  details: {
    orphanedRequests?: string[];
    outputPaths?: string[];
    issues?: Array<{
      file: string;
      line: number;
      type: string;
      severity: string;
      message: string;
      snippet?: string;
      fixed?: boolean;
    }>;
    backupsCreated?: string[];
    warnings?: string[];
  };
}

/**
 * Generates and saves a migration report in JSON and Markdown format.
 * Also prints a clean console summary.
 */
export function generateMigrationReport(data: MigrationReportData, outputDir: string): { jsonPath: string; mdPath: string } {
  const targetDir = path.resolve(outputDir);
  fs.ensureDirSync(targetDir);

  const jsonPath = path.join(targetDir, "portify-report.json");
  const mdPath = path.join(targetDir, "portify-report.md");

  // 1. Save JSON report
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf-8");

  // 2. Save Markdown report
  const mdContent = generateMarkdownReport(data);
  fs.writeFileSync(mdPath, mdContent, "utf-8");

  // 3. Output beautiful console report
  printConsoleSummary(data, jsonPath, mdPath);

  return { jsonPath, mdPath };
}

function generateMarkdownReport(data: MigrationReportData): string {
  const heading = data.type === "postman" ? "Postman API Migration" : "LocalStack Configuration Scan";
  const emoji = data.status === "success" ? "✅" : "⚠️";
  
  let md = `# ${emoji} Portify Migration Report\n\n`;
  md += `* **Type:** ${heading}\n`;
  md += `* **Timestamp:** ${data.timestamp}\n`;
  md += `* **Status:** ${data.status.toUpperCase()}\n`;
  md += `* **Dry Run:** ${data.dryRun ? "Yes" : "No"}\n`;
  md += `* **Backups Enabled:** ${data.backup ? "Yes" : "No"}\n`;
  md += `* **Summary:** ${data.summary}\n\n`;

  md += `## Stats\n\n`;
  md += `| Metric | Count |\n`;
  md += `| :--- | :--- |\n`;
  md += `| Files Processed | ${data.stats.filesProcessed} |\n`;
  md += `| Files Created | ${data.stats.filesCreated} |\n`;
  md += `| Files Modified | ${data.stats.filesModified} |\n`;
  md += `| Issues/Items Found | ${data.stats.issuesFound} |\n`;
  md += `| Issues/Items Fixed | ${data.stats.issuesFixed} |\n`;
  if (data.stats.variableCount !== undefined) {
    md += `| Variables Converted | ${data.stats.variableCount} |\n`;
  }
  if (data.stats.scriptConversions !== undefined) {
    md += `| Scripts/Tests Converted | ${data.stats.scriptConversions} |\n`;
  }
  md += `\n`;

  if (data.details.backupsCreated && data.details.backupsCreated.length > 0) {
    md += `## Backups Created\n\n`;
    for (const b of data.details.backupsCreated) {
      md += `* \`${b}\`\n`;
    }
    md += `\n`;
  }

  if (data.type === "postman") {
    if (data.details.outputPaths && data.details.outputPaths.length > 0) {
      md += `## Created/Modified Output Files\n\n`;
      for (const p of data.details.outputPaths) {
        md += `* \`${p}\`\n`;
      }
      md += `\n`;
    }

    if (data.details.orphanedRequests && data.details.orphanedRequests.length > 0) {
      md += `## ⚠️ Orphaned Requests (Unreferenced in codebase)\n\n`;
      for (const req of data.details.orphanedRequests) {
        md += `* ${req}\n`;
      }
      md += `\n`;
    }

    if (data.details.warnings && data.details.warnings.length > 0) {
      md += `## ⚠️ Authentication/Complex Configuration Warnings\n\n`;
      for (const w of data.details.warnings) {
        md += `* ${w}\n`;
      }
      md += `\n`;
    }
  } else {
    // LocalStack details
    if (data.details.issues && data.details.issues.length > 0) {
      md += `## Issues Detected\n\n`;
      md += `| File | Line | Type | Severity | Status | Message |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      for (const issue of data.details.issues) {
        const fixedStatus = issue.fixed ? "🔧 Fixed" : "❌ Unfixed";
        const snippetStr = issue.snippet ? ` (\`${issue.snippet}\`)` : "";
        md += `| \`${issue.file}\` | ${issue.line} | ${issue.type} | ${issue.severity} | ${fixedStatus} | ${issue.message}${snippetStr} |\n`;
      }
      md += `\n`;
    }
  }

  md += `*Report generated automatically by [Portify](https://github.com/tallow/portify).*`;
  return md;
}

function printConsoleSummary(data: MigrationReportData, jsonPath: string, mdPath: string) {
  logger.blank();
  const title = data.type === "postman" ? "Postman Conversion Report" : "LocalStack Scan Report";
  
  if (data.status === "success") {
    logger.success(chalk.bold(title));
  } else {
    logger.warn(chalk.bold(title));
  }
  
  logger.dim(`Summary:        ${data.summary}`);
  logger.dim(`Files Created:  ${data.stats.filesCreated}`);
  logger.dim(`Files Modified: ${data.stats.filesModified}`);
  
  if (data.stats.variableCount !== undefined && data.stats.variableCount > 0) {
    logger.dim(`Variables:      ${data.stats.variableCount} converted`);
  }
  if (data.stats.scriptConversions !== undefined && data.stats.scriptConversions > 0) {
    logger.dim(`Scripts:        ${data.stats.scriptConversions} converted`);
  }

  if (data.details.warnings && data.details.warnings.length > 0) {
    logger.blank();
    logger.warn(`Authentication/Complex Config Warnings (manual setup needed):`);
    for (const w of data.details.warnings) {
      logger.dim(` • ${w}`);
    }
  }

  if (data.details.backupsCreated && data.details.backupsCreated.length > 0) {
    logger.blank();
    logger.info(`Backups created:`);
    for (const b of data.details.backupsCreated) {
      logger.dim(` • ${b}`);
    }
  }

  logger.blank();
  logger.info(`Saved reports to output directory:`);
  logger.dim(` • JSON: ${path.relative(process.cwd(), jsonPath)}`);
  logger.dim(` • MD:   ${path.relative(process.cwd(), mdPath)}`);
}
