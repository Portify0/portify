# Portify

> One command. Escape vendor lock‑in.

[![npm version](https://img.shields.io/npm/v/portify-migrate.svg)](https://www.npmjs.com/package/portify-migrate)
[![CI](https://github.com/yourusername/portify/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/portify/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Portify** migrates your API collections and cloud emulator configs from locked‑in tools to open source alternatives.

- **Postman → Bruno / Hoppscotch** (with dead endpoint detection)
- **LocalStack → Floci / Moto** (auto‑fix docker‑compose, .env, tests)

No AI. No guesswork. Deterministic transformations with `--dry-run` for safety.

## Why Portify?

- March 2026: Postman killed free team plans. LocalStack sunset Community Edition.
- Existing migrators are fragile or incomplete.
- Portify is the only tool that **detects unused endpoints** and **scans your codebase** for real usage.

## Installation

```bash
npm install -g portify-migrate
```

## Usage

### Migrate a Postman collection

```bash
portify postman-migrate collection.json --target bruno --output ./bruno
# Also scan your codebase to find orphaned endpoints
portify postman-migrate collection.json --target hoppscotch --codebase ./src
```

### Migrate Postman Environment

```bash
portify postman-env environment.json --target bruno --output ./bruno-envs
```

### Migrate LocalStack

```bash
# Scan and preview fixes
portify localstack-migrate . --dry-run

# Apply fixes
portify localstack-migrate . --fix

# CI mode (exit 1 if issues found)
portify localstack-migrate . --check
```

## Supported Targets

| From        | To                | Status |
|-------------|-------------------|--------|
| Postman     | Bruno             | ✅     |
| Postman     | Hoppscotch        | ✅     |
| LocalStack  | Floci             | ✅     |
| LocalStack  | Moto              | ✅     |
| Postman     | Kong API Client (planned) | 🚧     |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). We welcome new transformers and better detection rules.

## License

MIT
