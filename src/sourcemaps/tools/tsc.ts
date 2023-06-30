// @ts-ignore - clack is ESM and TS complains about that. It works though
import clack, { select } from '@clack/prompts';
import chalk from 'chalk';
import { abortIfCancelled } from '../../utils/clack-utils';

const getCodeSnippet = () =>
  chalk.gray(`
{
  "compilerOptions": {
    ${chalk.greenBright('"sourceMap": true,')}
    ${chalk.greenBright('"inlineSources": true,')}

    // Set \`sourceRoot\` to  "/" to strip the build path prefix from
    // generated source code references. This will improve issue grouping in Sentry.
    ${chalk.greenBright('"sourceRoot": "/"')}
  }
}
`);

export async function configureTscSourcemapGenerationFlow(): Promise<void> {
  clack.log.step(
    `Add the following code to your TS config file to ensure you are generating source maps:`,
  );

  // Intentially logging directly to console here so that the code can be copied/pasted directly
  // eslint-disable-next-line no-console
  console.log(getCodeSnippet());

  await abortIfCancelled(
    select({
      message: 'Did you copy the snippet above?',
      options: [{ label: 'Yes, continue!', value: true }],
      initialValue: true,
    }),
  );
}
