// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import { abortIfCancelled } from '../../utils/clack-utils';

export async function configureCRASourcemapGenerationFlow(): Promise<void> {
  await abortIfCancelled(
    clack.select({
      message: `Verify that you are generating source maps when building your React app.\nGenerally this should already happen unless you set the GENERATE_SOURCEMAPS environment variable to false.`,
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
