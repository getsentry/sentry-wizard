// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as Sentry from '@sentry/node';

import { abortIfCancelled, showCopyPasteInstructions } from './clack';
import { traceStep } from '../telemetry';

export type AIEditorType = 'cursor' | 'vscode' | 'claude';

export interface AIRulesConfig {
  frameworkName: string;
  frameworkSpecificContent?: string;
}

/**
 * Get the file path for AI rules based on the editor type
 */
export function getAiRulesFilePath(editorType: AIEditorType): string {
  switch (editorType) {
    case 'cursor':
      return '.cursor/rules/sentryrules.mdc';
    case 'vscode':
      return '.github/instructions/sentryrules.md';
    case 'claude':
      return 'sentryrules.md';
  }
}

/**
 * Get the AI rules content based on the editor type and framework
 */
export function getAiRulesFileContent(
  editorType: AIEditorType,
  config: AIRulesConfig
): string {
  const baseContent = getBaseAIRulesContent(config);

  // For Cursor, add MDC frontmatter and wrap content
  if (editorType === 'cursor') {
    return `---
description: Sentry Setup Rules
globs:
alwaysApply: false
---

You are an expert at Sentry integration patterns and best practices for error monitoring, performance tracking, and debugging in production applications.

${baseContent}`;
  }

  // For VS Code and Claude, return as is (markdown)
  return baseContent;
}

/**
 * Get the base AI rules content that applies to all frameworks
 */
function getBaseAIRulesContent(config: AIRulesConfig): string {
  const frameworkSpecific = config.frameworkSpecificContent || '';
  const frameworkImport = config.frameworkName.toLowerCase() === 'next.js' ? 'nextjs' : config.frameworkName.toLowerCase();
  
  return `These examples should be used as guidance when configuring Sentry functionality within a ${config.frameworkName} project.

# Exception Catching

- Use \`Sentry.captureException(error)\` to capture an exception and log the error in Sentry.
- Use this in try catch blocks or areas where exceptions are expected

# Tracing Examples

- Spans should be created for meaningful actions within an applications like button clicks, API calls, and function calls
- Ensure you are creating custom spans with meaningful names and operations
- Span names should be parameterized. For example, when get a user by an id, name the span \`fetch /users/:id\` instead of \`fetch /users/1234\`
- Use the \`Sentry.startSpan\` function to create a span
- Child spans can exist within a parent span

## Custom Span instrumentation in component actions

- The \`name\` and \`op\` properties should be meaninful for the activities in the call.
- Attach attribute based on relevant information and metrics from the request

\`\`\`javascript
function TestComponent() {
  const handleTestButtonClick = () => {
    // Create a transaction/span to measure performance
    Sentry.startSpan({ 
      op: "ui.click", 
      name: "Test Button Click" 
    }, (span) => {
       
      const value = "some config"
      const metric = "some metric"
      
      // Metrics can be added to the span
      span.setAttribute("config", value)
      span.setAttribute("metric", metric)
      
      doSomething();
    });
  };

  return (
    <button 
      type="button" 
      onClick={handleTestButtonClick}
    >
      Test Sentry
    </button>
  );
}
\`\`\`

## Custom span instrumentation in API calls

- The \`name\` and \`op\` properties should be meaninful for the activities in the call.
- Attach attributes based on relevant information and metrics from the request

\`\`\`javascript
async function fetchUserData(userId) {
  return Sentry.startSpan(
    {
      name: 'fetch /api/users/:userId',
    },
    async () => {
      try {
        const response = await fetch(\`/api/users/\${userId}\`);
        const data = await response.json();
        return data;
      }
    );
  }
\`\`\`

# Logs 

- Where logs are used, ensure Sentry is imported using \`import * as Sentry from "@sentry/${frameworkImport}"\`.
- Enable logging in Sentry using \`Sentry.init({ _experiments: { enableLogs: true } })\`
- Reference the logger using \`const { logger } = Sentry\`.
- Sentry offers a consoleLoggingIntegration that can be used to log specific console error types automatically without instrumenting the individual logger calls

## Configuration

${frameworkSpecific}

### Baseline

\`\`\`javascript
import * as Sentry from "@sentry/${frameworkImport}";

Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",

  _experiments: {
    enableLogs: true,
  },
  
});
\`\`\`

### Logger Integration

\`\`\`javascript
Sentry.init({
  dsn: "https://examplePublicKey@o0.ingest.sentry.io/0",
  integrations: [
    // send console.log, console.error, and console.warn calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ["log", "error", "warn"] }),
  ],
});
\`\`\`

## Logger Examples 

\`\`\`javascript
logger.trace("Starting database connection", { database: "users" });
logger.debug("Cache miss for user", { userId: 123 });
logger.info("Updated profile", { profileId: 345 });
logger.warn("Rate limit reached for endpoint", {
  endpoint: "/api/results/",
  isEnterprise: false,
});
logger.error("Failed to process payment", {
  orderId: "order_123",
  amount: 99.99,
});
logger.fatal("Database connection pool exhausted", {
  database: "users",
  activeConnections: 100,
});
\`\`\`


`;
}

/**
 * Ask users if they want to create an AI rules file
 */
export async function askShouldCreateAiRulesFile(): Promise<boolean> {
  return await traceStep('ask-create-ai-rules-file', async (span) => {
    const shouldCreateAiRulesFile = await abortIfCancelled(
      clack.select({
        message: `Do you want to create an AI rules file with Sentry examples for your code editor?`,
        options: [
          {
            label: 'Yes',
            value: true,
            hint: 'Helps AI assistants understand Sentry patterns',
          },
          {
            label: 'No',
            value: false,
          },
        ],
        initialValue: true,
      }),
    );

    span?.setAttribute('shouldCreateAiRulesFile', shouldCreateAiRulesFile);
    Sentry.setTag('shouldCreateAiRulesFile', shouldCreateAiRulesFile);

    return shouldCreateAiRulesFile;
  });
}

/**
 * Ask users which AI editor they are using
 */
export async function askForAIEditorType(): Promise<AIEditorType> {
  return await traceStep('ask-ai-editor-type', async (span) => {
    const editorType = await abortIfCancelled(
      clack.select({
        message: 'Which AI-enabled code editor are you using?',
        options: [
          {
            label: 'Cursor',
            value: 'cursor' as AIEditorType,
            hint: 'Creates .cursor/rules/sentryrules.mdc file',
          },
          {
            label: 'VS Code (with GitHub Copilot or similar)',
            value: 'vscode' as AIEditorType,
            hint: 'Creates .github/instructions/sentryrules.md',
          },
          {
            label: 'Claude Code (Codebase)',
            value: 'claude' as AIEditorType,
            hint: 'Creates sentryrules.md in root',
          },
        ],
        initialValue: 'cursor' as AIEditorType,
      }),
    );

    span?.setAttribute('aiEditorType', editorType);
    Sentry.setTag('aiEditorType', editorType);

    return editorType;
  });
}

/**
 * Create AI rules file based on user's editor choice
 */
export async function createAIRulesFile(config: AIRulesConfig): Promise<void> {
  await traceStep('create-ai-rules-file', async () => {
    const shouldCreateAiRulesFile = await askShouldCreateAiRulesFile();
    if (shouldCreateAiRulesFile) {
      const editorType = await askForAIEditorType();
      
      try {
        const filePath = getAiRulesFilePath(editorType);
        const fullPath = path.join(process.cwd(), filePath);
        const dirPath = path.dirname(fullPath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(dirPath)) {
          await fs.promises.mkdir(dirPath, { recursive: true });
        }

        const aiRulesContent = getAiRulesFileContent(editorType, config);
        await fs.promises.writeFile(
          fullPath,
          aiRulesContent,
          { encoding: 'utf8', flag: 'w' },
        );

        const editorName = editorType === 'claude' ? 'Claude Code' : 
                          editorType === 'vscode' ? 'VS Code' : 'Cursor';
        
        clack.log.success(
          `Created AI rules file at ${chalk.cyan(filePath)} for ${chalk.cyan(editorName)}.`,
        );
      } catch (error) {
        const filePath = getAiRulesFilePath(editorType);
        clack.log.error(
          `Failed to create AI rules file at ${chalk.cyan(filePath)}.`,
        );

        const aiRulesContent = getAiRulesFileContent(editorType, config);
        await showCopyPasteInstructions({
          filename: filePath,
          codeSnippet: aiRulesContent,
          hint: "create the necessary directories and file if they don't already exist",
        });

        Sentry.captureException(error);
      }
    } else {
      clack.log.info('Skipped creating AI rules file.');
    }
  });
}