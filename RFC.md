# RFC: Postman + LocalStack migration tools (`portify`)

## The Opportunity

Recent platform shifts have created significant friction for development teams:
1. **Postman**: Removed its free team tier on March 1, 2026, motivating teams to migrate large collections to open alternatives like Bruno and Hoppscotch.
2. **LocalStack**: Discontinued the free Community Edition (CE) on March 23, 2026, making authentication mandatory. This broke CI/CD pipelines and Testcontainers configurations worldwide.

`portify` is a deterministic CLI utility to automate migration cleanup for these workflows.

---

## Part 1: Postman Migration Cleanup (`portify postman-migrate`)

Converts Postman v2.1 collections to Hoppscotch and Bruno formats.

### Key Features
- **Codebase Orphan Scan**: Statically scans your codebase to flag requests in the Postman collection that are never referenced (e.g. dead endpoints).
- **Environment Variable Normalization**: Automatically converts variables syntax (e.g. `{{var}}` to Hoppscotch `<<var>>` or Bruno format).
- **Script Conversion**: Replaces Postman's `pm.*` scripting sandbox APIs (like `pm.test`, `pm.environment.set/get`, and status assertions) with Hoppscotch or Bruno equivalents.
- **Bruno Directory Generation**: Exports collections directly as folder structures with `.bru` files matching Bruno's Git-friendly architecture.

---

## Part 2: LocalStack Migration Cleanup (`portify localstack-migrate`)

Scans your configurations (Docker Compose, CI workflow files, test files) to audit and fix LocalStack CE usage.

### Key Features
- **Sunsetted Image Check**: Detects references to deprecated `localstack/localstack` images.
- **Auth Token Audit**: Flags CI workflows missing the mandatory `LOCALSTACK_AUTH_TOKEN` (required since March 23, 2026).
- **Testcontainers & URL Audits**: Detects usages of emulated AWS endpoints (`localhost:4566`).
- **Autofix Engine**: Automatically replaces Docker images with open alternatives like `floci`, `ministack`, or `moto`.
