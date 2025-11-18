# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sentry Wizard is a CLI tool that helps developers set up Sentry in their projects. It supports multiple frameworks including React Native, Flutter, Next.js, Nuxt, Remix, SvelteKit, Angular, iOS, Android, Cordova, and Electron.

The wizard automates SDK installation, configuration file creation, and build tool integration. It handles authentication with Sentry, project selection, and writes framework-specific configuration.

## Development Commands

### Build and Run
```bash
yarn build                    # Build TypeScript to dist/
yarn build:watch             # Build in watch mode
yarn try                     # Run wizard locally without building (uses ts-node)
yarn try:uninstall          # Test uninstall flow
```

### Testing
```bash
yarn test                    # Run unit tests with coverage (vitest)
yarn test:watch             # Run tests in watch mode
yarn test:e2e               # Run all end-to-end tests
yarn test:e2e [Framework]   # Run specific framework tests (Flutter, Remix, NextJS, SvelteKit, etc.)
```

E2E tests require a `.env` file with credentials (see `e2e-tests/.env.example`).

### Code Quality
```bash
yarn lint                    # Run Prettier + ESLint
yarn lint:prettier          # Check formatting
yarn lint:eslint            # Check linting
yarn fix                    # Auto-fix Prettier + ESLint issues
yarn fix:prettier           # Auto-fix formatting
yarn fix:eslint             # Auto-fix linting
```

### Running Wizard in External Projects

To test the wizard in an external project:
```bash
ts-node path/to/sentry-wizard/bin.ts
```

Or use `yarn link` (see CONTRIBUTING.md for detailed instructions).

## Architecture

### Dual Wizard System: `lib/` vs `src/`

The codebase has two wizard implementations:

- **`lib/` (Legacy)**: Old step-based wizards using Inquirer.js. Only used for Cordova and Electron. **Deprecated - do not add new wizards here.**
- **`src/` (Current)**: Modern Clack-based wizards with better UX. All new wizards should be added here.

Entry point is `bin.ts` → `src/run.ts` which dispatches to the appropriate wizard.

### Wizard Structure Pattern

Each integration follows this structure (example: `src/nextjs/`):

```
src/nextjs/
├── nextjs-wizard.ts    # Main wizard orchestration
├── templates.ts        # Code templates and snippets
└── utils.ts           # Integration-specific utilities
```

**Key wizard flow pattern:**
1. Welcome and environment validation (`printWelcome`)
2. Git check (`confirmContinueIfNoOrDirtyGitRepo`)
3. Package detection (`ensurePackageIsInstalled`)
4. Sentry authentication and project selection (`getOrAskForProjectData`)
5. Feature selection (framework-specific prompts)
6. File modifications (config files, initialization code)
7. SDK installation (`installPackage`)
8. Final instructions and outro

All wizards are wrapped with `withTelemetry()` for error tracking and usage metrics.

### Shared Utilities (`src/utils/`)

- **`clack/`**: User interaction utilities (prompts, spinners, confirmation dialogs)
  - Core abstraction over `@clack/prompts` library
  - Handles project data fetching, package installation, git checks
  - `abortIfCancelled()` pattern used throughout for user cancellation

- **`package-manager.ts`**: Auto-detects NPM/Yarn/PNPM/Bun/Deno and provides unified interface
- **`package-json.ts`**: Read/write package.json, check versions
- **`ast-utils.ts`**: AST manipulation for code modifications (uses Recast and Magicast)
- **`git.ts`**: Git operations and status checks
- **`debug.ts`**: Debug logging system
- **`types.ts`**: Core TypeScript types (`WizardOptions`, `SentryProjectData`, etc.)

### Configuration Files

Wizards may create these files:
- `.sentryclirc`: Sentry CLI configuration (auth token, org/project)
- `.env.sentry-build-plugin`: Environment variables for build plugins
- `sentry.properties`: Java/Android/Flutter projects
- Framework-specific config files (e.g., `sentry.client.config.ts` for Next.js)

### Telemetry System (`src/telemetry.ts`)

All wizard executions are wrapped with telemetry that:
- Tracks wizard completion/failure
- Records integration type, Node version, platform
- Sends anonymous usage data to Sentry (can be disabled with `--disable-telemetry`)
- Uses `traceStep()` for granular operation tracking

### Integration Constants

`lib/Constants.ts` defines the `Integration` enum and platform mappings. When adding new integrations, update this file and the switch statement in `src/run.ts`.

## Testing Architecture

### Unit Tests
- Located in `test/` directory
- Use Vitest with coverage tracking
- Mock-heavy for file operations and external APIs
- Run with `yarn test`

### E2E Tests
- Located in `e2e-tests/`
- Each test has a corresponding test application in `e2e-tests/test-applications/`
- Tests run the full wizard flow and verify:
  - Files are created correctly
  - Package.json is updated
  - Projects build successfully
  - Dev/prod modes work
- Use `WizardTestEnv` class to spawn wizard instances
- Require real Sentry credentials (set in `.env`)

## Code Patterns and Conventions

### Error Handling
- Use `abort()` from clack utils to exit gracefully with error messages
- Use `abortIfCancelled()` after every prompt to handle Ctrl+C
- Wrap main wizard logic in try-catch for telemetry error capture

### File Modifications
- Prefer reading files before modifying (use `fs.readFileSync` to check existence)
- Use AST manipulation for JavaScript/TypeScript (see `ast-utils.ts`)
- Use string replacement carefully for non-JS files
- Always preserve user code when possible

### Prompts and UX
- Use Clack prompts for consistency (not Inquirer)
- Provide clear intro/outro messages
- Show spinners for long operations
- Offer helpful error messages with actionable next steps
- Ask before destructive operations (e.g., overwriting files)

### TypeScript
- Target ES2020, module: node16
- Strict type checking enabled
- Use `@ts-expect-error` for ESM imports (Clack, Magicast) due to CommonJS constraints
- Avoid `any` types where possible

### Package Management
- Always detect package manager automatically (`getPackageManager()`)
- Use the detected package manager for all operations
- Handle Yarn/NPM/PNPM/Bun/Deno variations properly
- Consider peer dependency issues (offer `--force-install` as escape hatch)

## Important Constraints

- **Node.js requirement**: >=18.20.6 (enforced in `bin.ts`)
- **ESM/CommonJS**: Project is CommonJS but uses some ESM dependencies (Clack, Magicast)
- **Git awareness**: Wizards check for uncommitted changes and warn users
- **No destructive operations**: Never delete user code without explicit confirmation
- **Telemetry opt-out**: Always respect `--disable-telemetry` flag

## Adding a New Integration

1. Create wizard directory in `src/[integration-name]/`
2. Implement `[integration-name]-wizard.ts` following existing patterns
3. Add entry to `Integration` enum in `lib/Constants.ts`
4. Update switch statement in `src/run.ts`
5. Add integration option to CLI prompt in `src/run.ts`
6. Create unit tests in `test/[integration-name]/`
7. Create e2e test app and tests in `e2e-tests/`
8. Update CHANGELOG.md

## CLI Arguments

All CLI arguments can also be set via environment variables:
- `--debug` / `SENTRY_WIZARD_DEBUG`: Enable verbose logging
- `--uninstall` / `SENTRY_WIZARD_UNINSTALL`: Revert setup (not all integrations)
- `--skip-connect` / `SENTRY_WIZARD_SKIP_CONNECT`: Skip server connection
- `--quiet` / `SENTRY_WIZARD_QUIET`: Non-interactive mode
- `-i, --integration` / `SENTRY_WIZARD_INTEGRATION`: Preselect integration
- `-u, --url` / `SENTRY_WIZARD_URL`: Sentry instance URL
- `--disable-telemetry`: Opt out of telemetry
- `--force-install`: Bypass package manager checks (use with caution)
- `--ignore-git-changes`: Skip git dirty check

See README.md for complete list.

## Common Issues

### Magicast/Clack ESM Imports
The project uses CommonJS but some dependencies (Clack, Magicast) are ESM-only. Suppress TypeScript errors with:
```typescript
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
```

### Package Manager Detection
Use `getPackageManager()` from `src/utils/clack/index.ts` - never hard-code NPM/Yarn/PNPM.

### AST Modifications
For JavaScript/TypeScript code modifications, use `magicast` or `recast` libraries. See `src/utils/ast-utils.ts` and integration-specific utils for patterns.

### Testing with Real Projects
When debugging integration issues, use `yarn try` in the wizard repo, then run it in a real test project:
```bash
cd /path/to/test-project
ts-node /path/to/sentry-wizard/bin.ts -i nextjs --debug
```
