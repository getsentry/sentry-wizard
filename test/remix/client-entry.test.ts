// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile, writeFile } from 'magicast';
import { updateEntryClientMod } from '../../src/remix/sdk-setup';

describe('initializeSentryOnEntryClient', () => {
  it('should initialize Sentry on client entry with all features enabled', async () => {
    const originalEntryClientMod = await loadFile(
      `${__dirname}/test-files-empty/entry.client.tsx`,
    );

    const dsn = 'https://sentry.io/123';
    const selectedFeatures = {
      performance: true,
      replay: true,
      spotlight: true,
    };

    const result = updateEntryClientMod(
      originalEntryClientMod,
      dsn,
      selectedFeatures,
    );

    const code = await writeFile(result as unknown as any);

    expect(code).toMatchInlineSnapshot(`undefined`);
  });
});
