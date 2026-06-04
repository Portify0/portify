# Contributing to Portify

First off, thank you for considering contributing to Portify! It's people like you that make this tool a lifesaver for developers migrating away from proprietary or discontinued setups.

## 1. Where to Start

- **Bugs and Feature Requests:** Please check the [Issue Tracker](https://github.com/your-username/portify/issues) before opening a new issue.
- **Discussions:** If you have an idea for a new migration target (e.g., migrating to Kong API Client), let's discuss it in an issue first.

## 2. Development Setup

Portify is written in TypeScript. To get started locally:

```bash
# Clone the repository
git clone https://github.com/your-username/portify.git
cd portify

# Install dependencies
npm install

# Build the project
npm run build

# Run locally in dev mode
npm run dev -- --help
```

## 3. Architecture Overview

- **`src/index.ts`**: The CLI entry point using `commander`. Registers commands, options, and handles CLI output.
- **`src/postman-migrator.ts`**: Core logic for parsing Postman collections, converting scripts/variables, and generating outputs (Bruno, Hoppscotch).
- **`src/localstack-migrator.ts`**: Core logic for scanning Docker/CI files for deprecated LocalStack usage and performing autofixes.

## 4. Adding a New Migration Target

If you want to add a new export format for Postman (e.g., Kong API Client):
1. Update `PostmanMigrateOptions` in `src/postman-migrator.ts` to accept the new target name.
2. Add an `else if (target === "kong-api-client") { ... }` block inside `migratePostmanCollection`.
3. Add relevant script and variable conversion logic for the new format.
4. Update the `--target` option description in `src/index.ts`.

## 5. Testing

- We use local fixtures for testing migrations.
- When you add a new feature or fix a bug, please add a corresponding test scenario in `tests/fixtures/`.
- Ensure `--dry-run` behaves correctly for any new features (no files should be written when it is enabled).

## 6. Submitting a Pull Request

1. Fork the repo and create your branch from `main`.
2. Ensure your code passes standard TypeScript compilation (`npm run build`).
3. Describe your changes clearly in the PR, including before/after examples if you changed how code/configurations are converted.
4. We will review your PR as quickly as possible!
