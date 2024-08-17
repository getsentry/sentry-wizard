import * as path from 'path';
import { cleanupGit, revertLocalChanges, runWizard } from './utils';
import { Integration } from '../lib/Constants';

const integrations: Integration[] = [Integration.remix];

integrations.map(async (integration) => {
  const projectDir = path.resolve(
    `${__dirname}/test-applications/${integration}-test-app`,
  );
  await runWizard(integration, projectDir);

  const testRunner = await import(`./tests/${integration}.test`);

  await testRunner.run(projectDir, integration);

  await revertLocalChanges(projectDir);
  await cleanupGit(projectDir);
});
