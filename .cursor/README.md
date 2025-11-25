# Cursor Configuration

This directory contains Cursor-specific configuration.

## Commands

Commands in the `commands/` directory are symlinked from `.claude/commands/` to maintain a single source of truth for custom commands that work across AI coding tools.

See `.claude/README.md` for full documentation on available commands and usage.

## Adding New Commands

Add new commands to `.claude/commands/` (not here) so they're automatically available in both Claude Code and Cursor:

```bash
# Create a new command
echo "# Your Command\n\nYour prompt here" > .claude/commands/your-command.md

# Symlink will be created automatically
ln -s ../../.claude/commands/your-command.md .cursor/commands/your-command.md
```
