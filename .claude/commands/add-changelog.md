# Add Changelog Entry

Add an entry to CHANGELOG.md following the project conventions.

Usage: `/add-changelog <type>(<scope>): <description>`

## Format
```
- type(scope): Description ([#PR-number](PR-link))
```

## Types
- `feat`: New feature
- `fix`: Bug fix
- `ref`: Refactoring
- `chore`: Build process or tooling changes
- `docs`: Documentation only

## Guidelines
- Add `!` after type for breaking changes (e.g., `ref!:`)
- Include scope in parentheses (e.g., `nextjs`, `react-native`, `core`)
- Add entry under the `## Unreleased` section
- Leave PR number as placeholder if not yet created

## Examples
```
- feat(nextjs): Add support for App Router instrumentation
- fix(react-native): Correct Metro config merge logic
- ref!: Require Node.js 18.20.0 or higher
```
