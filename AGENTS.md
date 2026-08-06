# Agent Instructions

## Package Manager
Use **yarn**: `yarn install`, `yarn build`, `yarn test`, `yarn fix`

## Commit Attribution
AI commits MUST include a `Co-Authored-By` trailer with the model name:
```
Co-Authored-By: <Model Name> <noreply@<provider>.com>
```
Examples:
- `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- `Co-Authored-By: GPT-4o <noreply@openai.com>`
- `Co-Authored-By: Gemini Pro <noreply@google.com>`

## Code Rules
- No `any` type — use proper types or `unknown`
- No `console.log` — use clack prompts or chalk
- No `@ts-expect-error` unless for clack/magicast ESM imports
- Prefix unused variables with `_`
- Run `yarn fix` before committing
- Run `runPrettierIfInstalled()` after modifying user files

## Changelog
- Update `CHANGELOG.md` under `## Unreleased`
- Format: `- type(scope): Description ([#PR](link))`
- Types: `feat`, `fix`, `ref`, `chore`, `docs` (add `!` for breaking)

## Wizard Design Philosophy
- One shell command + minimal user input to get SDK running
- Transparent: log every file created/modified, package installed, and failure
- Respect user decisions: never enable features users declined (e.g. don't set `tracesSampleRate` if tracing was declined)
- Cater to 80%: cover typical projects, fail gracefully on edge cases
- Support self-hosted Sentry via `--url` param

### Auth Token Handling
- Store in `.sentryclirc`, `sentry.properties`, or `.env.sentry-build-plugins`
- NEVER inject auth tokens into user code
- Ensure token files are added to `.gitignore`

### Code Modifications
- Prefer `magicast`/`recast` for AST modifications
- Regex only when safe and well-scoped (beware of matching comments)
- Detect existing Sentry code before modifying; ask to proceed if found

### UI Conventions
- `clack.log.success` / `chalk.green` — success messages
- `clack.log.warn` / `chalk.yellow` — warnings (e.g. existing Sentry code found)
- `clack.log.error` / `chalk.red` — errors
- `clack.log.info` — informational messages
- `clack.log.step` — step progress
- `chalk.cyan` — highlight file names, package names
- `clack.spinner` — long operations (downloads, installs)
- `console.log` (no clack) — copy/paste code snippets only

### Telemetry
- Wrap wizards with `withTelemetry()`; use `traceStep()` for individual spans
- Never capture stack traces (may contain absolute paths)
- Use `Sentry.setTag()` for user decisions, SDK versions, package managers

## Wizard Pattern
All wizards in `src/<integration>/<integration>-wizard.ts` follow:
1. `printWelcome()` + `confirmContinueIfNoOrDirtyGitRepo()`
2. `getOrAskForProjectData()`
3. `featureSelectionPrompt()`
4. `ensurePackageIsInstalled()` + `installPackage()`
5. Config files, build tools, code injection
6. `offerProjectScopedMcpConfig()`
7. Outro

- Wrap all prompts with `abortIfCancelled()`
- Wrap wizards with `withTelemetry()`

## Architecture
- Entry: `bin.ts` → `src/run.ts`
- Integrations: `src/{nextjs,react-native,react-router,remix,nuxt,sveltekit,angular,apple,android,flutter,sourcemaps}/`
- Shared utils: `src/utils/` (AST via `ast-utils.ts`, packages via `package-json.ts`, UI via `clack/`)
- Tests mirror `src/` in `test/`; E2E in `e2e-tests/`

## CLI
| Command | Description |
|---------|-------------|
| `yarn build` | Clean + compile TypeScript |
| `yarn test` | Unit tests with coverage (vitest) |
| `yarn test:e2e [framework]` | E2E tests |
| `yarn lint` | Prettier + ESLint check |
| `yarn fix` | Auto-fix lint + format |
| `yarn try -i <integration>` | Run wizard locally |
| `npx vitest run test/path.test.ts` | Single test file |

## Skills
- `/review-wizard <integration>` — Review wizard implementation. See `.agents/skills/review-wizard/`
- `/test-wizard <integration>` — Test wizard locally. See `.agents/skills/test-wizard/`
- `/catchup` — Resume session context. See `.agents/skills/catchup/`
