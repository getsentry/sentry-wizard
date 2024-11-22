import * as path from 'path';
import { cleanupGit, revertLocalChanges } from '../utils';
import {
  runWizardOnNuxtProject,
  testNuxtProjectBuildsAndRuns,
  testNuxtProjectConfigs,
  testNuxtProjectSetup,
} from '../utils/nuxtHelpers';

describe('Nuxt-3', () => {
  const projectDir = path.resolve(
    __dirname,
    '../test-applications/nuxt-3-test-app',
  );

  beforeAll(async () => {
    await runWizardOnNuxtProject(projectDir);
  });

  afterAll(() => {
    revertLocalChanges(projectDir);
    cleanupGit(projectDir);
  });

  testNuxtProjectSetup(projectDir);

  testNuxtProjectConfigs(projectDir);

  testNuxtProjectBuildsAndRuns(projectDir);
});
