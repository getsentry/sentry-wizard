// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import pc from 'picocolors';
import fs from 'fs';
import * as Sentry from '@sentry/node';
import { RNCliSetupConfigContent } from './react-native-wizard';
import { addToGitignore } from './git';

const EXPO_ENV_LOCAL_FILE = '.env.local';

export async function addExpoEnvLocal(
  options: RNCliSetupConfigContent,
): Promise<boolean> {
  const newContent = `#DO NOT COMMIT THIS\nSENTRY_AUTH_TOKEN=${options.authToken}\n`;

  const added = await addToGitignore(EXPO_ENV_LOCAL_FILE);
  if (added) {
    Sentry.setTag('expo-env-local', 'added-to-gitignore');
    clack.log.success(`Added ${pc.cyan(EXPO_ENV_LOCAL_FILE)} to .gitignore.`);
  } else {
    Sentry.setTag('expo-env-local', 'add-to-gitignore-error');
    clack.log.error(
      `Could not add ${pc.cyan(
        EXPO_ENV_LOCAL_FILE,
      )} to .gitignore, please add it to not commit your auth key.`,
    );
    Sentry.captureException(
      `Could not add ${EXPO_ENV_LOCAL_FILE} to .gitignore`,
    );
  }

  if (!fs.existsSync(EXPO_ENV_LOCAL_FILE)) {
    try {
      await fs.promises.writeFile(EXPO_ENV_LOCAL_FILE, newContent);
      Sentry.setTag('expo-env-local', 'written');
      clack.log.success(`Written ${pc.cyan(EXPO_ENV_LOCAL_FILE)}.`);
      return true;
    } catch (error) {
      Sentry.setTag('expo-env-local', 'write-error');
      clack.log.error(`Unable to write ${pc.cyan(EXPO_ENV_LOCAL_FILE)}.`);
      Sentry.captureException(`Unable to write ${EXPO_ENV_LOCAL_FILE}.`);
      return false;
    }
  }

  Sentry.setTag('expo-env-local', 'exists');
  clack.log.info(`Updating existing ${pc.cyan(EXPO_ENV_LOCAL_FILE)}.`);

  try {
    await fs.promises.appendFile(EXPO_ENV_LOCAL_FILE, newContent);
    Sentry.setTag('expo-env-local', 'updated');
    clack.log.success(`Updated ${pc.cyan(EXPO_ENV_LOCAL_FILE)}.`);
    return true;
  } catch (error) {
    Sentry.setTag('expo-env-local', 'update-error');
    clack.log.error(`Unable to update ${pc.cyan(EXPO_ENV_LOCAL_FILE)}.`);
    Sentry.captureException(`Unable to update ${EXPO_ENV_LOCAL_FILE}.`);
    return false;
  }
}
