import { Answers, ui } from 'inquirer';
import * as _ from 'lodash';
import { IArgs } from '../Constants';
import { BaseStep, IStep } from '../Steps/BaseStep';
import { BaseProject } from '../Steps/Projects/BaseProject';
import { BottomBar } from './BottomBar';
import { debug, dim, nl, red } from './Logging';

function sanitizeArgs(argv: IArgs) {
  let baseUrl = argv.url;
  baseUrl += baseUrl.endsWith('/') ? '' : '/';
  baseUrl = baseUrl.replace(/:\/(?!\/)/g, '://');
  argv.url = baseUrl;
}

export function getCurrentIntegration(answers: Answers) {
  return _.get(answers, 'integration') as BaseProject;
}

export async function startWizard<M extends IStep>(
  argv: IArgs,
  ...steps: Array<{ new (debug: IArgs): M }>
) {
  sanitizeArgs(argv);
  if (argv.debug) {
    debug(argv);
  }
  if (argv.quiet) {
    dim("Quiet mode On, DAMA, don't ask me anything");
  }
  let allAnswers = null;
  try {
    allAnswers = await steps.map(step => new step(argv)).reduce(async (answer, step) => {
      const prevAnswer = await answer;
      const answers = await step.emit(prevAnswer);
      return { ...prevAnswer, ...answers };
    }, Promise.resolve({}));
  } catch (e) {
    BottomBar.hide();
    nl();
    red('Sentry Setup Wizard failed with:');
    red('Protip: Add --debug to see whats going on');
    red('OR use --help to see your options');
    nl();
    red(e);
  }
  return allAnswers;
}
