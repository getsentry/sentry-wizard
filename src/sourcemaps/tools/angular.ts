// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import pc from 'picocolors';
import { abortIfCancelled, makeCodeSnippet } from '../../utils/clack';

export const angularJsonTemplate = makeCodeSnippet(true, (unchanged, plus) =>
  unchanged(`{
  "projects": {
    'your-project': {
      "architect": {
        "build": {
          "options": {
            ${plus(`"sourceMap": true`)}
          },
        },
      }
    }
  }
}`),
);

export async function configureAngularSourcemapGenerationFlow(): Promise<void> {
  clack.log.info(
    `Enable generating source maps in your ${pc.bold('angular.json')} file:`,
  );

  // Intentionally logging directly to console here so that the code can be copied/pasted directly
  // eslint-disable-next-line no-console
  console.log(angularJsonTemplate);

  await abortIfCancelled(
    clack.select({
      message: `Verify that you are generating source maps when building your Angular app.`,
      options: [
        {
          label: 'I checked!',
          hint: 'My build output folder contains .js.map files after a build.',
          value: true,
        },
      ],
      initialValue: true,
    }),
  );
}
