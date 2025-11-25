# AI Assistant Configuration

This directory contains configuration files for AI coding assistants (Claude Code, Cursor, etc.).

## Custom Slash Commands

The `commands/` directory contains reusable prompt templates that work with both Claude Code and Cursor:

- `/test-wizard <integration>` - Test the wizard locally for a specific integration
- `/review-wizard <integration>` - Review wizard implementation for pattern compliance
- `/add-changelog <type>(scope): description` - Add an entry to CHANGELOG.md
- `/catchup` - Summarize session progress from markdown files

## Cross-Tool Compatibility

Commands are stored in `.claude/commands/` and symlinked to `.cursor/commands/` so they work with both:
- **Claude Code**: Automatically discovers commands in `.claude/commands/`
- **Cursor**: Automatically discovers commands in `.cursor/commands/`

Both tools use the same Markdown-based format, so maintaining a single set of commands works seamlessly.

## Usage

In either tool, type `/` in the chat to see available commands:
```
/test-wizard nextjs
/review-wizard react-native
/add-changelog feat(remix): Add source maps support
```

## Settings

`settings.local.json` contains local-only configuration (not checked into git).
