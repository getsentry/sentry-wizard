/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as _ from 'lodash';
import { enableDebugLogs } from '../src/utils/debug';

import { readEnvironment } from './Helper/Env';
import { startWizard } from './Helper/Wizard';
import * as Step from './Steps';

/**
 * @deprecated this function is the entry point to the old, step-based wizards located in `lib`.
 * When creating new wizards, we now add them to clack-based wizards under `src`.
 * Therefor, do not call this function anymore.
 * Use `run` from {@link ../src/run.ts} instead.
 */
export async function run(argv: any): Promise<any> {
  const args = { ...argv, ...readEnvironment() };

  if (argv.debug) {
    enableDebugLogs();
  }

  if (args.uninstall === undefined) {
    args.uninstall = false;
  }
  let steps = [
    Step.Initial,
    Step.Welcome,
    Step.ChooseIntegration,
    Step.ShouldConfigure,
  ];
  if (args.uninstall === false) {
    steps = _.concat(
      steps,
      Step.OpenSentry,
      Step.WaitForSentry,
      Step.SentryProjectSelector,
      Step.PromptForParameters,
    );
  }
  steps = _.concat(steps, Step.ConfigureProject, Step.Result);
  return startWizard(args, ...steps);
}
