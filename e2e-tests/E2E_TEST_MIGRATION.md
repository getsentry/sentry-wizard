# E2E Test Migration Guide: From Imperative to Clifty

This guide explains how to convert our e2e tests from the old imperative
approach to the new declarative approach using `clifty`.

## Overview

### Old Approach (Imperative)

The old approach used `startWizardInstance()` and manually managed the wizard
interaction flow with conditional logic:

- `wizardInstance.waitForOutput()` - Wait for specific output
- `wizardInstance.sendStdinAndWaitForOutput()` - Send input and wait for
  response
- Complex conditional flows with boolean flags
- Manual process lifecycle management (`wizardInstance.kill()`)

### New Approach (Declarative with Clifty)

The new approach uses `clifty` to declare the expected interaction flow upfront:

- `withEnv().defineInteraction()` - Create an interaction definition
- `.whenAsked().respondWith()` - Declare responses to prompts
- `.expectOutput()` - Declare expected outputs
- `.run()` - Execute the interaction
- Cleaner, more readable code

## Migration Steps

### 1. Update Imports

**Remove:**

```typescript
import {
  startWizardInstance,
  KEYS, // This will come from clifty instead
  // ... other imports
} from '../utils';
```

**Add:**

```typescript
import {
  getWizardCommand,
  initGit,
  // ... other imports (not startWizardInstance)
} from '../utils';

//@ts-expect-error - clifty is ESM only
import { KEYS, withEnv } from 'clifty';
```

### 2. Update the `beforeAll` Hook

**Old Pattern:**

```typescript
beforeAll(async () => {
  await runWizardOnProject(projectDir, integration);
});
```

**New Pattern:**

```typescript
beforeAll(async () => {
  initGit(projectDir);
  revertLocalChanges(projectDir);

  await runWizardOnProject(projectDir, integration);
});
```

**Why:** The `initGit` and `revertLocalChanges` calls ensure a clean git state
before running the wizard, which is a best practice for test isolation.

### 3. Convert the Wizard Runner Function

This is the main conversion work. Here's a detailed before/after example:

#### Before (Imperative):

```typescript
async function runWizardOnProject(
  projectDir: string,
  integration: Integration,
  fileModificationFn?: (
    projectDir: string,
    integration: Integration,
  ) => unknown,
) {
  const wizardInstance = startWizardInstance(integration, projectDir);
  let packageManagerPrompted = false;

  if (fileModificationFn) {
    fileModificationFn(projectDir, integration);
    await wizardInstance.waitForOutput('Do you want to continue anyway?');
    packageManagerPrompted = await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Please select your package manager.',
    );
  } else {
    packageManagerPrompted = await wizardInstance.waitForOutput(
      'Please select your package manager.',
    );
  }

  const tracingPrompted =
    packageManagerPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.DOWN, KEYS.ENTER],
      'Do you want to enable Tracing',
      { timeout: 240_000 },
    ));

  const replayPrompted =
    tracingPrompted &&
    (await wizardInstance.sendStdinAndWaitForOutput(
      [KEYS.ENTER],
      'Do you want to enable Session Replay',
    ));

  // ... more conditional chains ...

  wizardInstance.kill();
}
```

#### After (Declarative):

```typescript
async function runWizardOnProject(
  projectDir: string,
  integration: Integration,
  fileModificationFn?: (
    projectDir: string,
    integration: Integration,
  ) => unknown,
) {
  const wizardInteraction = withEnv({
    cwd: projectDir,
  }).defineInteraction();

  if (fileModificationFn) {
    fileModificationFn(projectDir, integration);

    wizardInteraction
      .whenAsked('Do you want to continue anyway?')
      .respondWith(KEYS.ENTER);
  }

  wizardInteraction
    .whenAsked('Please select your package manager.')
    .respondWith(KEYS.DOWN, KEYS.ENTER)
    .whenAsked('Do you want to enable Tracing', {
      timeout: 240_000, // package installation can take a while in CI
    })
    .respondWith(KEYS.ENTER)
    .whenAsked('Do you want to enable Session Replay')
    .respondWith(KEYS.ENTER)
    // ... more whenAsked/respondWith chains ...
    .expectOutput('Successfully installed the SDK!');

  await wizardInteraction.run(getWizardCommand(integration));
}
```

### 4. Key Conversion Patterns

#### Pattern 1: Simple Wait and Respond

**Old:**

```typescript
await wizardInstance.sendStdinAndWaitForOutput(
  [KEYS.ENTER],
  'Please select your package manager.',
);
```

**New:**

```typescript
wizardInteraction
  .whenAsked('Please select your package manager.')
  .respondWith(KEYS.ENTER);
```

#### Pattern 2: Wait with Timeout

**Old:**

```typescript
await wizardInstance.sendStdinAndWaitForOutput(
  [KEYS.ENTER],
  'Do you want to enable Tracing',
  { timeout: 240_000 },
);
```

**New:**

```typescript
wizardInteraction
  .whenAsked('Do you want to enable Tracing', {
    timeout: 240_000,
  })
  .respondWith(KEYS.ENTER);
```

#### Pattern 3: Optional Prompts

**Old:**

```typescript
const mcpPrompted = await wizardInstance.sendStdinAndWaitForOutput(
  [KEYS.ENTER],
  'Optionally add a project-scoped MCP',
  { optional: true },
);

if (mcpPrompted) {
  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.DOWN, KEYS.ENTER],
    'Successfully installed',
  );
} else {
  await wizardInstance.waitForOutput('Successfully installed');
}
```

**New:**

```typescript
// clifty handles optional prompts automatically
wizardInteraction
  .whenAsked('Optionally add a project-scoped MCP')
  .respondWith(KEYS.ENTER)
  .expectOutput('Successfully installed');
```

#### Pattern 4: Conditional File Modifications

**Old:**

```typescript
if (fileModificationFn) {
  fileModificationFn(projectDir, integration);
  await wizardInstance.waitForOutput('Do you want to continue anyway?');
  await wizardInstance.sendStdinAndWaitForOutput(
    [KEYS.ENTER],
    'Please select your package manager.',
  );
}
```

**New:**

```typescript
// File modification happens BEFORE defining interactions
if (fileModificationFn) {
  fileModificationFn(projectDir, integration);

  // Then add the expected prompt to the interaction chain
  wizardInteraction
    .whenAsked('Do you want to continue anyway?')
    .respondWith(KEYS.ENTER);
}

// Continue with the rest of the interaction
wizardInteraction
  .whenAsked('Please select your package manager.')
  .respondWith(KEYS.DOWN, KEYS.ENTER);
```

#### Pattern 5: Multiple Key Presses

**Old:**

```typescript
await wizardInstance.sendStdinAndWaitForOutput(
  [KEYS.DOWN, KEYS.ENTER],
  'Next prompt',
);
```

**New:**

```typescript
wizardInteraction
  .whenAsked('Current prompt')
  .respondWith(KEYS.DOWN, KEYS.ENTER);
```

#### Pattern 6: Expecting Output Without Input

**Old:**

```typescript
await wizardInstance.waitForOutput('Successfully installed');
```

**New:**

```typescript
wizardInteraction.expectOutput('Successfully installed');
```

### 5. Using Step-Based Organization (Optional)

For complex wizards, you can use `.step()` to organize interactions:

```typescript
wizardInteraction
  .step('intro', ({ expectOutput }) => {
    expectOutput('Welcome to the wizard');
  })
  .step('package installation', ({ whenAsked, expectOutput }) => {
    whenAsked('Please select your package manager.').respondWith(
      KEYS.DOWN,
      KEYS.ENTER,
    );
    expectOutput('Installing packages');
  })
  .step('SDK setup', ({ whenAsked }) => {
    whenAsked('Do you want to enable Tracing').respondWith(KEYS.ENTER);
    whenAsked('Do you want to enable Session Replay').respondWith(KEYS.ENTER);
  })
  .expectOutput('Successfully installed');
```

### 6. Matching Partial Text

When the full text might have formatting (bold, colors), match partial strings:

**Old:**

```typescript
// "Do you want to enable Tracing" sometimes doesn't work as `Tracing` can be in bold
await wizardInstance.sendStdinAndWaitForOutput(
  [KEYS.ENTER],
  'to track the performance of your application?',
);
```

**New:**

```typescript
// Same approach - match the unformatted part
wizardInteraction
  .whenAsked('to track the performance of your application?')
  .respondWith(KEYS.ENTER);
```

## Common Pitfalls & Tips

### ✅ Do's

1. **Always call file modifications BEFORE building the interaction:**

   ```typescript
   if (fileModificationFn) {
     fileModificationFn(projectDir, integration);  // First!
     wizardInteraction.whenAsked(...);             // Then!
   }
   ```

2. **Chain interactions in the order they appear:**

   ```typescript
   wizardInteraction
     .whenAsked('First question')
     .respondWith(KEYS.ENTER)
     .whenAsked('Second question') // Order matters!
     .respondWith(KEYS.ENTER);
   ```

3. **Use partial text matching for prompts with formatting:**

   ```typescript
   .whenAsked('to track the performance')  // Good - avoids bold "Tracing"
   ```

4. **Add timeouts for long operations:**

   ```typescript
   .whenAsked('Do you want to enable Tracing', {
     timeout: 240_000,  // 4 minutes for npm install in CI
   })
   ```

5. **Initialize git state in beforeAll:**
   ```typescript
   beforeAll(async () => {
     initGit(projectDir);
     revertLocalChanges(projectDir);
     // ...
   });
   ```

### ❌ Don'ts

1. **Don't use boolean flags to track state:**

   ```typescript
   // ❌ Old imperative approach
   let packageManagerPrompted = false;
   if (something) {
     packageManagerPrompted = await instance.sendStdinAndWaitForOutput(...);
   }
   ```

2. **Don't manually kill the process:**

   ```typescript
   // ❌ No longer needed
   wizardInstance.kill();
   ```

3. **Don't use `startWizardInstance`:**

   ```typescript
   // ❌ Old approach
   const wizardInstance = startWizardInstance(integration, projectDir);

   // ✅ New approach
   const wizardInteraction = withEnv({ cwd: projectDir }).defineInteraction();
   ```

4. **Don't build complex conditional flows:**

   ```typescript
   // ❌ Avoid this
   if (prompted1 && prompted2) {
     // ...
   }

   // ✅ clifty handles flow automatically
   ```

## Complete Example

See these files for complete examples:

- `e2e-tests/tests/sveltekit-tracing.test.ts` - Simple wizard with steps
- `e2e-tests/tests/sveltekit-hooks.test.ts` - Wizard with file modifications
- `e2e-tests/tests/cloudflare-wrangler-sourcemaps.test.ts` - Source maps wizard
- `e2e-tests/tests/remix.test.ts` - Multiple test scenarios

## Mandatory: Testing Your Migration

After converting a test:

1. **Run the test locally:**

   ```bash
   yarn test:e2e YourFramework
   ```

2. **Check for timing issues:**

   - If the test times out, increase the timeout for long operations
   - Look for prompts that might not be matching correctly

3. **Verify the test is isolated:**

   - Run it multiple times to ensure git state is properly reset
   - Check that `initGit` and `revertLocalChanges` are called

4. **Format the code:**
   ```bash
   yarn fix
   ```

## Benefits of the New Approach

1. **More Readable:** Declarative code is easier to understand at a glance
2. **Less Boilerplate:** No manual process management or boolean flags
3. **Better Maintainability:** Changes to wizard flow are easier to update
4. **Automatic Cleanup:** clifty handles process lifecycle
5. **Clearer Intent:** The test reads like a conversation flow

## Troubleshooting:

If you encounter timeouts or other test issues, enable the debug option in clifty's env to read the wizard's output. This helps checking where things might need adjustments:

```ts
  const wizardInteraction = withEnv({
    cwd: projectDir,
    debug: true, // <-- prints console output
  }).defineInteraction();
```

## Questions?

If you encounter issues during migration, check:

1. The example tests mentioned above
2. The `clifty` documentation
3. Ask the team for help!
