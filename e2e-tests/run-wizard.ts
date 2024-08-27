import * as path from 'path';
import { cleanupGit, log, revertLocalChanges, runWizard } from './utils';
import { Integration } from '../lib/Constants';

const integrations: Integration[] = [Integration.remix];

process.on('SIGINT', () => {
  process.exit(0);
});

integrations.map(async (integration) => {
  const projectDir = path.resolve(
    `${__dirname}/test-applications/${integration}-test-app`,
  );
  process.on('exit', () => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  try {
    await runWizard(integration, projectDir);

    const testRunner = await import(`./tests/${integration}.test`);
    await testRunner.run(projectDir, integration);

    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  } catch (e) {
    log.error(e);
    process.exit(1);
  }

  process.exit(0);
});
