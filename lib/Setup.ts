import * as _ from 'lodash';
import { Args } from './Constants';
import { green, red } from './Helper/Logging';
import { startWizard } from './Helper/Wizard';
import * as Step from './Steps';
const readEnv = require('read-env').default;

export async function run(argv: any): Promise<{}> {
  const args = { ...argv, ...readEnv('SENTRY_WIZARD') };
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
