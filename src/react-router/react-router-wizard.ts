// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';

import type { WizardOptions } from '../utils/types';

export function runReactRouterWizard(options: WizardOptions): void {
  clack.log.info(chalk.cyan('React Router wizard is not yet implemented.'));
  clack.log.info(`Options received: ${JSON.stringify(options, null, 2)}`);

  // TODO: Implement the full React Router wizard
  // This is a placeholder to fix TypeScript compilation
}
