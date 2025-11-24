# Review Wizard Implementation

Review the implementation of a specific wizard integration for correctness and adherence to the wizard pattern.

Usage: `/review-wizard <integration-name>`

## Standard Wizard Pattern Checklist

Verify the wizard follows this pattern:
1. ✓ Welcome & Git Check with `printWelcome()` and `confirmContinueIfNoOrDirtyGitRepo()`
2. ✓ Project Selection with `getOrAskForProjectData()`
3. ✓ Feature Selection with `featureSelectionPrompt()` if applicable
4. ✓ Package Installation with `ensurePackageIsInstalled()` and `installPackage()`
5. ✓ Configuration (config files, build tools, code injection)
6. ✓ MCP Offer with `offerProjectScopedMcpConfig()`
7. ✓ Outro with completion message

## Additional Checks
- Uses `abortIfCancelled()` for all prompts
- Calls `runPrettierIfInstalled()` after file modifications
- Uses telemetry with `withTelemetry()` wrapper
- Has corresponding unit tests in `test/<integration>/`

Review the wizard at: `src/<integration>/<integration>-wizard.ts`
