# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-06-04

### Fixed
- **Backup & Idempotency in Environment Migration**: Refactored `environment-migrator.ts` to utilize the standard `writeWithBackup` wrapper, ensuring `--backup` and `--dry-run` behavior is uniform and safe across all commands. Added a `--backup` option to the `postman-env` CLI command.

## [0.2.0] - 2026-06-04

### Added
- **Migration Reporter (`src/reporter.ts`)**: Generates comprehensive migration reports in JSON (`portify-report.json`) and Markdown (`portify-report.md`) formats. Displays a beautifully colorized summary on the console after conversion or scanning.
- **Timestamped Backups & Idempotency (`src/utils/file-system.ts`)**: Added a `--backup` option to both `postman-migrate` and `localstack-migrate` commands to create a timestamped backup copy (`[file].portify-backup-[timestamp]`) before editing or overwriting any file. Added strict content comparison to avoid writing to files if their content hasn't changed.
- **Complex Authentication Detection**: Analyzes Postman collection files for complex and advanced authentication protocols (`oauth2`, `awssig`, `digest`, `hawk`, etc.) on root, folder, and request levels, reporting warnings with configuration parameters for manual migration.
- **Strict CI Verification mode**: Added `--auth-warning-as-error` to fail the build (exit code 1) in strict CI environments if any complex authentications requiring manual configuration are detected.
- **Terraform Endpoint Scan**: Added scanner support for Terraform configurations (`*.tf`, `*.tfvars`) to identify integration blocks referencing deprecated LocalStack endpoints.
- **Robust Filesystem Scanning**: Added try-catch guards in directory crawlers to gracefully handle files/directories disappearing concurrently during tests.

### Changed
- CLI options updated:
  - `postman-migrate` supports `--backup` and `--auth-warning-as-error`.
  - `localstack-migrate` supports `--backup` and `-o, --output <dir>`.
- Updated test suites with full coverage for new features.
