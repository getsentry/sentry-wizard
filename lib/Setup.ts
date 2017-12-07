import * as _ from 'lodash';
import { IArgs } from './Constants';
import { green, red } from './Helper/Logging';
import { startWizard } from './Helper/Wizard';
import * as Step from './Steps';
const readEnv = require('read-env').default;

export async function run(argv: any) {
  const args = { ...argv, ...readEnv('SENTRY_WIZARD') };
  let steps = [Step.Initial, Step.Welcome, Step.ChooseIntegration, Step.ShouldConfigure];
  if (args.uninstall === false) {
    steps = _.concat(
      steps,
      Step.OpenSentry,
      Step.WaitForSentry,
      Step.SentryProjectSelector
    );
  }
  steps = _.concat(steps, Step.PromptForParameters, Step.ConfigureProject, Step.Result);
  return startWizard(args, ...steps);
}
