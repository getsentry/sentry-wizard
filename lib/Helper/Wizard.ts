import { Answers, ui } from 'inquirer';
import * as _ from 'lodash';
import { DEFAULT_URL, IArgs, Integration } from '../Constants';
import { BaseStep, IStep } from '../Steps/BaseStep';
import { BaseIntegration } from '../Steps/Integrations/BaseIntegration';
import { BottomBar } from './BottomBar';
import { debug, dim, nl, red } from './Logging';

function sanitizeAndValidateArgs(argv: IArgs) {
  if (!argv.url) {
    argv.url = DEFAULT_URL;
    dim(`no URL provided, fallback to ${argv.url}`);
  }
  if (!argv.quiet) {
    argv.quiet = true;
    dim('will activate quiet mode for you');
  }
  let baseUrl = argv.url;
  baseUrl += baseUrl.endsWith('/') ? '' : '/';
  baseUrl = baseUrl.replace(/:\/(?!\/)/g, '://');
  argv.url = baseUrl;
}

export function getCurrentIntegration(answers: Answers) {
  return _.get(answers, 'integration') as BaseIntegration;
}

export async function startWizard<M extends IStep>(
  argv: IArgs,
  ...steps: Array<{ new (debug: IArgs): M }>
) {
  try {
    sanitizeAndValidateArgs(argv);
    if (argv.debug) {
      debug(argv);
    }
    if (argv.quiet) {
      dim("Quiet mode On, DAMA, don't ask me anything");
    }
    return await steps.map(step => new step(argv)).reduce(async (answer, step) => {
      const prevAnswer = await answer;
      const answers = await step.emit(prevAnswer);
      return { ...prevAnswer, ...answers };
    }, Promise.resolve({}));
  } catch (e) {
    BottomBar.hide();
    nl();
    red('Sentry Wizard failed with:');
    red(argv.debug ? e : e.message);
    nl();
    red('Protip: Add --debug to see whats going on');
    red('OR use --help to see your options');
  }
}
