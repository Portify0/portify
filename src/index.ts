#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import path from "path";
import ora from "ora";
import * as logger from "./logger.js";
import { migratePostmanCollection } from "./postman-migrator.js";
import { migrateLocalStack } from "./localstack-migrator.js";
import { generateMigrationReport } from "./reporter.js";

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

const program = new Command();

program
  .name("portify")
  .description("Deterministic Postman & LocalStack Migration Cleanup CLI")
  .version(pkg.version);

program
  .command("postman-migrate")
  .description("Clean up and migrate Postman collections to Bruno or Hoppscotch format")
  .argument("<collection-json>", "Path to Postman collection JSON file")
  .requiredOption("-t, --target <hoppscotch|bruno>", "Target platform to convert to")
  .option("-o, --output <dir>", "Output directory for converted files", ".")
  .option("--no-scan", "Disable codebase scanning for orphaned requests")
  .option("-c, --codebase <path>", "Path to your source code directory for orphan analysis", ".")
  .option("--dry-run", "Perform a dry run without writing any files")
  .option("--backup", "Create backups of existing files before modifying/overwriting")
  .option("--auth-warning-as-error", "Exit with error code 1 if any authentication warnings are detected (useful for strict CI)")
  .action(async (collectionJson, options) => {
    logger.info(`🚀 Portify: Starting Postman migration cleanup...`);
    logger.dim(`Collection: ${collectionJson}`);
    logger.dim(`Target:     ${options.target}`);
    if (options.dryRun) {
      logger.warn(`[DRY RUN] No files will be written`);
    }

    const spinner = ora("Analyzing collection and scanning codebase...").start();
    try {
      const report = await migratePostmanCollection({
        collectionPath: collectionJson,
        target: options.target as "hoppscotch" | "bruno",
        outputDir: options.output,
        scanCodebase: options.scan,
        codebasePath: options.codebase,
        dryRun: options.dryRun,
        backup: options.backup,
        authWarningAsError: false // Handled in CLI to allow reporting first
      });

      spinner.succeed("Analysis and conversion complete!");

      // Generate Migration Report
      generateMigrationReport({
        timestamp: new Date().toISOString(),
        type: "postman",
        dryRun: !!options.dryRun,
        backup: !!options.backup,
        status: report.warnings.length > 0 ? "failure" : "success",
        summary: report.warnings.length > 0
          ? `Migrated Postman collection with ${report.warnings.length} authentication warning(s).`
          : `Successfully migrated Postman collection to ${options.target}.`,
        stats: {
          filesProcessed: 1,
          filesCreated: report.filesCreated,
          filesModified: report.filesModified,
          issuesFound: report.orphanedRequests.length + report.warnings.length,
          issuesFixed: 0,
          variableCount: report.variableCount,
          scriptConversions: report.scriptConversions
        },
        details: {
          orphanedRequests: report.orphanedRequests,
          outputPaths: report.outputPaths,
          backupsCreated: report.backupsCreated,
          warnings: report.warnings
        }
      }, options.output);

      if (options.dryRun) {
        logger.warn(`\n🎉 Postman migration dry run complete! No files written.`);
      } else {
        logger.success(`\n🎉 Postman migration cleanup complete!`);
      }

      if (options.authWarningAsError && report.warnings.length > 0) {
        logger.error(`\n❌ --auth-warning-as-error mode enabled: Exiting with error because ${report.warnings.length} authentication warning(s) were found.`);
        process.exit(1);
      }
    } catch (err: any) {
      spinner.fail("Migration failed");
      logger.error(`Error during migration: ${err.stack || err.message}`);
      process.exit(1);
    }
  });

program
  .command("localstack-migrate")
  .description("Scan Docker Compose and CI configs to migrate away from LocalStack Community Edition")
  .argument("[path]", "Path to scan for configurations", ".")
  .option("--fix", "Automatically fix container images and basic properties")
  .option("-a, --alternative <floci|ministack|moto>", "Alternative image to use", "floci")
  .option("--dry-run", "Perform a dry run without modifying configurations")
  .option("--check", "Exit with error code 1 if any issues are found (useful for CI)")
  .option("--backup", "Create backups of existing files before modifying/overwriting")
  .option("-o, --output <dir>", "Output directory for conversion report", ".")
  .action(async (scanPath, options) => {
    logger.info(`🚀 Portify: Scanning configuration files for LocalStack usage...`);
    logger.dim(`Scan Path:   ${scanPath}`);
    logger.dim(`Alternative: ${options.alternative}`);
    logger.dim(`Autofix:     ${options.fix ? "Enabled" : "Disabled"}`);
    if (options.dryRun) {
      logger.warn(`[DRY RUN] No files will be written`);
    }

    const spinner = ora("Scanning configurations...").start();
    try {
      const report = await migrateLocalStack({
        scanPath,
        autofix: options.fix,
        alternative: options.alternative as "floci" | "ministack" | "moto",
        dryRun: options.dryRun,
        backup: options.backup
      });

      spinner.succeed("Scan complete!");

      // Map issues for details
      const issueDetails = report.issues.map(iss => ({
        file: iss.file,
        line: iss.line,
        type: iss.type,
        severity: iss.severity,
        message: iss.message,
        snippet: iss.snippet,
        fixed: !!options.fix && iss.type === "image"
      }));

      // Generate Migration Report
      generateMigrationReport({
        timestamp: new Date().toISOString(),
        type: "localstack",
        dryRun: !!options.dryRun,
        backup: !!options.backup,
        status: report.issues.length > 0 ? "failure" : "success",
        summary: report.issues.length > 0 
          ? `Found ${report.issues.length} LocalStack integration issues.` 
          : "No LocalStack deprecated config issues found.",
        stats: {
          filesProcessed: report.filesProcessed,
          filesCreated: 0,
          filesModified: report.filesModified,
          issuesFound: report.issues.length,
          issuesFixed: report.fixedCount
        },
        details: {
          issues: issueDetails,
          backupsCreated: report.backupsCreated
        }
      }, options.output || ".");

      if (options.fix && report.fixedCount > 0) {
        if (options.dryRun) {
          logger.warn(`\n🔧 [DRY RUN] Would autofix ${report.fixedCount} occurrences/configurations!`);
        } else {
          logger.success(`\n🔧 Autofixed ${report.fixedCount} occurrences/configurations successfully!`);
        }
      } else if (!options.fix) {
        logger.info(`\n💡 Tip: Run with --fix to automatically replace image declarations with ${options.alternative}.`);
      }

      logger.success(`\n🎉 LocalStack scan complete!`);

      if (options.check && report.issues.length > 0) {
        logger.error(`\n❌ --check mode enabled: Exiting with error because ${report.issues.length} issue(s) were found.`);
        process.exit(1);
      }
    } catch (err: any) {
      spinner.fail("Scan failed");
      logger.error(`Error during LocalStack migration: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("postman-env")
  .description("Migrate Postman Environment to Bruno or Hoppscotch")
  .argument("<environmentFile>", "Path to Postman environment JSON")
  .option("--target <target>", "bruno or hoppscotch", "bruno")
  .option("--output <dir>", "Output directory", "./portify-envs")
  .option("--dry-run", "Preview only without writing")
  .option("--backup", "Create backups of existing files before modifying/overwriting")
  .action(async (envFile, options) => {
    const { parsePostmanEnvironment, toBrunoEnv, toHoppscotchEnv } = await import("./environment-migrator.js");
    try {
      const env = parsePostmanEnvironment(envFile);
      const writeResult = options.target === "bruno"
        ? toBrunoEnv(env, options.output, !!options.backup, !!options.dryRun)
        : toHoppscotchEnv(env, options.output, !!options.backup, !!options.dryRun);

      if (options.dryRun) {
        logger.warn(`[DRY RUN] Would migrate environment "${env.name}" to ${options.target}`);
      } else {
        logger.success(`Environment "${env.name}" successfully migrated to ${options.target} at ${options.output}`);
        if (writeResult.backupCreated) {
          logger.info(`Backup created at: ${writeResult.backupCreated}`);
        }
      }
    } catch (err: any) {
      logger.error(`Error migrating environment: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
