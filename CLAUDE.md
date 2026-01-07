# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sentry Wizard is a CLI tool that automates Sentry SDK setup for multiple frameworks and platforms. It's built with TypeScript and uses a wizard-style interface to guide users through configuration.

## IMPORTANT: Code Style & Quality Rules

**YOU MUST follow these rules when modifying code:**

### TypeScript Requirements
- NEVER use `any` type - use proper types or `unknown`
- NO `@ts-expect-error` or `@ts-ignore` unless absolutely necessary (clack/magicast ESM imports are known exceptions)
- DO use explicit error handling with proper types
- Unused variables must be prefixed with `_` (e.g., `_unusedArg`)

### Logging & Output
- NO `console.log` statements - use clack prompts or chalk for user output
- Import logging utilities from `lib/Helper/Logging` for internal logging needs

### Code Formatting
- Prettier config: 80 char width, single quotes, trailing commas
- ALWAYS run `yarn fix` before committing
- Run `runPrettierIfInstalled()` after modifying user files in wizards

### Testing Requirements
- ALL new wizard features must have unit tests in `test/`
- Test files mirror `src/` structure
- Use Vitest with proper assertion function names (see .eslintrc.js overrides)
- For test-specific assertions: `checkFileContents`, `checkFileExists`, `checkPackageJson`, `checkIfBuilds`, etc.

### Git & Changelog
- ALWAYS update CHANGELOG.md under `## Unreleased` section
- Format: `- type(scope): Description ([#PR-number](PR-link))`
- Types: `feat`, `fix`, `ref`, `chore`, `docs` (add `!` for breaking changes)

## Development Commands

### Building
```bash
yarn build         # Clean, compile TypeScript, and copy scripts
yarn build:watch   # Watch mode for development
```

### Testing
```bash
yarn test          # Run unit tests with coverage (vitest)
yarn test:watch    # Run tests in watch mode
yarn test:e2e      # Run end-to-end tests (requires .env file with credentials)
yarn test:e2e [Flutter | Remix | NextJS | SvelteKit]  # Run specific e2e test
```

### Linting & Formatting
```bash
yarn lint          # Check with prettier + eslint
yarn fix           # Auto-fix with eslint + prettier
```

### Local Testing
```bash
yarn try           # Run wizard locally via ts-node (takes CLI args)
yarn try:uninstall # Run wizard in uninstall mode
```

To test in external projects:
```bash
ts-node path/to/sentry-wizard/bin.ts
```

Or use `yarn link` workflow (see CONTRIBUTING.md).

### Running a Single Test
```bash
npx vitest run test/path/to/file.test.ts
```

## Code Architecture

### Entry Points

- **`bin.ts`**: CLI entry point that parses arguments with yargs and validates Node.js version (>=18.20.0)
- **`src/run.ts`**: Main orchestration that routes to framework-specific wizards based on integration selection
- **`index.ts`**: Exports legacy setup for programmatic usage

### Integration Structure

Each framework has its own directory under `src/` with a `*-wizard.ts` entry point:

- `src/nextjs/` - Next.js setup
- `src/react-native/` - React Native (including Expo support)
- `src/react-router/` - React Router framework mode
- `src/remix/` - Remix setup
- `src/nuxt/` - Nuxt setup
- `src/sveltekit/` - SvelteKit setup
- `src/angular/` - Angular setup
- `src/apple/` - iOS setup (Xcode project manipulation)
- `src/android/` - Android setup
- `src/flutter/` - Flutter setup
- `src/sourcemaps/` - Source map upload configuration

Legacy integrations (Cordova, Electron) remain in `lib/` directory.

### Wizard Pattern

All modern wizards follow a consistent pattern:

1. **Welcome & Git Check**: Use `printWelcome()` and `confirmContinueIfNoOrDirtyGitRepo()`
2. **Project Selection**: Call `getOrAskForProjectData()` to select/create Sentry project (unless `spotlight` mode)
3. **Feature Selection**: Use `featureSelectionPrompt()` for optional features
4. **Package Installation**: Use `ensurePackageIsInstalled()` and `installPackage()`
5. **Configuration**: Create config files, modify build tools, inject code snippets
6. **MCP Offer**: Call `offerProjectScopedMcpConfig()` to suggest MCP configuration
7. **Outro**: Show completion message with next steps

### Shared Utilities (`src/utils/`)

- **`clack/`**: UI interaction helpers built on @clack/prompts
  - `clack/index.ts`: Core wizard utilities (prompts, package management, file creation)
  - `clack/mcp-config.ts`: MCP configuration offering
- **`ast-utils.ts`**: AST manipulation using magicast and recast
- **`package-json.ts`**: Package.json reading and dependency checking
- **`package-manager.ts`**: Detect package manager (npm/yarn/pnpm/bun)
- **`git.ts`**: Git repository interaction
- **`bash.ts`**: Shell command execution helpers
- **`types.ts`**: Shared TypeScript types (`WizardOptions`, `SentryProjectData`, etc.)

### Telemetry (`src/telemetry.ts`)

Uses `@sentry/node` to track wizard usage. All wizards are wrapped with `withTelemetry()` which creates transactions and captures errors.

### Build Process

- TypeScript compilation outputs to `dist/`
- `postbuild` script: Makes `dist/bin.js` executable and copies `scripts/**` to `dist/`
- Scripts directory contains platform-specific helper scripts used by wizards

## Important Patterns

### Code Modification

The wizard extensively modifies user code and configuration files:

- **JavaScript/TypeScript**: Uses `magicast` (via `ast-utils.ts`) for AST manipulation
- **Config Files**: Many wizards create/modify framework-specific configs (next.config.js, metro.config.js, vite.config.ts, etc.)
- **Native Code**: Apple wizard manipulates Xcode projects via `xcode` package; Android manipulates Gradle files

Always use `runPrettierIfInstalled()` after file modifications.

### Environment Variables

Options can be set via CLI args or environment variables:
- `SENTRY_WIZARD_DEBUG` - Enable verbose logging
- `SENTRY_WIZARD_INTEGRATION` - Preselect integration
- `SENTRY_WIZARD_URL` - Sentry installation URL
- `SENTRY_WIZARD_SKIP_CONNECT` - Skip server connection
- `SENTRY_WIZARD_QUIET` - No prompts
- `SENTRY_WIZARD_UNINSTALL` - Uninstall mode

### Framework Detection

Wizards typically detect framework setup by:
- Reading `package.json` dependencies
- Checking for framework-specific config files
- Looking for specific directory structures

### Error Handling

Use `abortIfCancelled()` wrapper for all Clack prompts to handle Ctrl+C gracefully. Use `abort()` for fatal errors.

## Testing

### Unit Tests (`test/`)

- Uses Vitest with coverage via `@vitest/coverage-v8`
- Tests mirror `src/` structure
- Run specific test files directly with `npx vitest run test/path/to/file.test.ts`

### E2E Tests (`e2e-tests/`)

- `test-applications/`: Complete framework apps for testing
- `tests/`: Test files that run wizard against test apps
- `utils/`: Test helpers including assertion functions for reusable checks (e.g. `checkIfBuilds`)
- Requires `.env` file with Sentry credentials
- Use `yarn test:e2e [framework]` to run specific framework tests
- Use `clifty` to define wizard run and interactions

## Special Considerations

### React Native

Most complex wizard with multiple concerns:
- Expo vs bare React Native detection
- iOS Xcode project configuration
- Android Gradle plugin setup
- Metro bundler configuration
- CocoaPods integration

### Next.js

Handles both App Router and Pages Router:
- Creates instrumentation hooks
- Modifies/creates next.config.js
- Optionally creates error pages and example routes
- Configures source maps upload

### Apple/iOS

Directly manipulates Xcode projects:
- Adds Sentry packages via CocoaPods or SPM
- Injects build phases for debug file upload
- Modifies bundle scripts
- Uses `xcode` npm package for .pbxproj manipulation

## Version & Release

- Version defined in `src/version.ts` (imported by `bin.ts`)
- Changelog maintained in `CHANGELOG.md` (see CONTRIBUTING.md for format)
- Uses Craft for releases (`.craft.yml`)
- Licensed under FSL-1.1-MIT
