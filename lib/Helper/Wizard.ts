import type { Answers } from 'inquirer';
import * as _ from 'lodash';

import type { Args } from '../Constants';
import type { IStep } from '../Steps/BaseStep';
import type { BaseIntegration } from '../Steps/Integrations/BaseIntegration';
import { BottomBar } from './BottomBar';
import { debug, dim, nl, red } from './Logging';

function sanitizeAndValidateArgs(argv: Args): void {
  if (argv.quiet === undefined) {
    argv.quiet = true;
    dim('will activate quiet mode for you');
  }
  // @ts-ignore skip-connect does not exist on args
  if (argv['skip-connect']) {
    // @ts-ignore skip-connect does not exist on args
    argv.skipConnect = argv['skip-connect'];
    // @ts-ignore skip-connect does not exist on args
    delete argv['skip-connect'];
  }
  // @ts-ignore skip-connect does not exist on args
  argv.promoCode = argv['promo-code'];
}

export function getCurrentIntegration(answers: Answers): BaseIntegration {
  return _.get(answers, 'integration') as BaseIntegration;
}

export async function startWizard<M extends IStep>(
  argv: Args,
  ...steps: Array<{ new (debug: Args): M }>
): Promise<Answers> {
  try {
    sanitizeAndValidateArgs(argv);
    if (argv.debug) {
      debug(argv);
    }
    if (argv.quiet) {
      dim("Quiet mode On, DAMA, don't ask me anything");
    }
    return await steps
      .map((step) => new step(argv))
      .reduce(async (answer, step) => {
        const prevAnswer = await answer;
        const answers = await step.emit(prevAnswer);
        return { ...prevAnswer, ...answers };
      }, Promise.resolve({}));
  } catch (e) {
    BottomBar.hide();
    nl();
    red('Sentry Wizard failed with:');
    red(argv.debug ? String(e) : (e as Error).message);
    nl();
    red('Protip: Add --debug to see whats going on');
    red('OR use --help to see your options');
    process.exit(1);
  }
}
