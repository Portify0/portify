# Portify

> One command. Escape vendor lock‑in.

[![npm version](https://img.shields.io/npm/v/portify-migrate.svg)](https://www.npmjs.com/package/portify-migrate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Portify** is a surgical CLI tool designed to migrate your API collections and cloud emulator configurations away from locked-in tools to open-source alternatives.

- **Postman → Bruno / Hoppscotch** (with automatic pre-request/test script translation & dead-endpoint analysis)
- **LocalStack → Floci / Moto / MiniStack** (auto-fix docker-compose configs, CI pipelines, .env variables, and tests)
- **Environments Conversion**: Convert Postman environments directly to Bruno/Hoppscotch variables.
- **Unified Migration Reporter**: Automated JSON & Markdown reports compiled at the end of each run showing exactly what was processed, warning logs, and backups created.

No AI. No guesswork. Purely deterministic AST/string transformations with `--dry-run` support and automatic timestamped backups.

---

## 🚀 Key Features

* **Codebase Scanning for Orphaned API Requests**: When migrating Postman collections, Portify parses your codebase (`.ts`, `.js`, `.py`, `.go`, `.java`, etc.) to match request endpoints against actual usage, finding unused (dead) API declarations.
* **Script Conversion**: Translates Postman test scripts and pre-request scripts (`pm.*` API commands like `pm.environment.get`, `pm.test`, `pm.expect`) into equivalent Hoppscotch (`pw.*`) or Bruno (`bru.*`) format.
* **LocalStack Alternatives Mapping**: Scans Docker Compose, CI workflows, Kubernetes configs, and Terraform files to replace sunsetted `localstack` community images with alternatives (default `floci`).
* **CI Integration Gates**: Gate your PRs or builds using flags to fail on authentication warnings or deprecated images.
* **Safe Backups & Dry Runs**: Create timestamped file backups of any files modified on disk, or run with `--dry-run` to preview all transformations without writing anything.

---

## 📦 Installation

```bash
npm install -g portify-migrate
```

---

## 🛠️ Usage & CLI Reference

### 1. Migrate a Postman Collection (`postman-migrate`)
Convert a Postman collection JSON file into individual Bruno request files or a Hoppscotch collection file.

```bash
portify postman-migrate <collection-json> -t <bruno|hoppscotch> [options]
```

#### Options:
* `-t, --target <hoppscotch|bruno>` **(Required)**: The platform to convert to.
* `-o, --output <dir>`: Directory where converted files should be saved (default: `.`).
* `-c, --codebase <path>`: Source code directory path to scan for orphaned endpoints (default: `.`).
* `--no-scan`: Disable codebase scanning for orphaned endpoints.
* `--dry-run`: Preview all file creations/changes in the terminal without modifying the filesystem.
* `--backup`: Create backups of existing files before modifying or overwriting.
* `--auth-warning-as-error`: Exit with error code `1` if any authentication warnings (e.g. unsupported OAuth2/AWS Signature configs) are found. Useful for strict CI gates.

```bash
# Example: Convert to Bruno, scan codebase, make backups
portify postman-migrate my-collection.json -t bruno -o ./bruno-collection -c ./src --backup
```

---

### 2. Migrate Postman Environments (`postman-env`)
Convert Postman environment variable JSON files to Bruno or Hoppscotch format.

```bash
portify postman-env <environment-json> [options]
```

#### Options:
* `--target <bruno|hoppscotch>`: Target format to output (default: `bruno`).
* `--output <dir>`: Output directory for variables (default: `./portify-envs`).
* `--dry-run`: Preview variables in console without writing files.
* `--backup`: Backup existing environment files on conflict.

```bash
# Example: Migrate to Hoppscotch
portify postman-env my-env.json --target hoppscotch -o ./hoppscotch-vars
```

---

### 3. Migrate LocalStack Configs (`localstack-migrate`)
Scan docker-compose, CI pipelines, Terraform, and kubernetes files for sunsetted LocalStack Community Edition configurations.

```bash
portify localstack-migrate [path] [options]
```

#### Options:
* `[path]`: Directory path to scan (default: `.`).
* `-a, --alternative <floci|ministack|moto>`: Alternative emulator image to use (default: `floci`).
* `--fix`: Automatically replace deprecated image configurations and save updates on disk.
* `--check`: Exit with error code `1` if any LocalStack Community Edition occurrences are found (excellent for CI checks).
* `--dry-run`: Scan and output warnings/fixes without changing any files.
* `--backup`: Keep a timestamped copy of any configuration files prior to updating.

```bash
# Example: CI gate check
portify localstack-migrate . --check
```

---

## 📊 Migration Reports

At the end of every `postman-migrate` or `localstack-migrate` run, Portify generates a detailed report in the output directory:

1. **`portify-report.json`**: A machine-readable log containing processed file counts, modified counts, lists of orphaned requests, warning logs, and backup files.
2. **`portify-report.md`**: A clean, human-readable summary of the migration, showing exactly what actions were taken.

---

## 🏗️ Supported Targets Status

| From | To | Status |
| :--- | :--- | :--- |
| Postman Collection | Bruno (`.bru`) | ✅ |
| Postman Collection | Hoppscotch (`.json`) | ✅ |
| Postman Environment | Bruno Variables (`.json`) | ✅ |
| Postman Environment | Hoppscotch Variables (`.json`) | ✅ |
| LocalStack Configs | Floci / Moto / MiniStack | ✅ |
| Postman Collection | Kong API Client | 🚧 (Planned) |

---

## 🛡️ License

MIT
