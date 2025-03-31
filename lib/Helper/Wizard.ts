import type { Answers } from 'inquirer';

import type { Args } from '../Constants';
import type { IStep } from '../Steps/BaseStep';
import type { BaseIntegration } from '../Steps/Integrations/BaseIntegration';
import { BottomBar } from './BottomBar';
import { debug, dim, nl, red } from './Logging';

function sanitizeAndValidateArgs(argv: Args & Record<string, unknown>): void {
  if (argv.quiet === undefined) {
    argv.quiet = true;
    dim('will activate quiet mode for you');
  }
  if (argv['skip-connect']) {
    argv.skipConnect = argv['skip-connect'] as Args['skipConnect'];
    delete argv['skip-connect'];
  }
  argv.promoCode = argv['promo-code'] as Args['promoCode'];
  if (argv['ignore-git-changes']) {
    argv.ignoreGitChanges = argv[
      'ignore-git-changes'
    ] as Args['ignoreGitChanges'];
    delete argv['ignore-git-changes'];
  }
  if (argv['xcode-project-dir']) {
    argv.xcodeProjectDir = argv['xcode-project-dir'] as Args['xcodeProjectDir'];
    delete argv['xcode-project-dir'];
  }
}

export function getCurrentIntegration(answers: Answers): BaseIntegration {
  return answers.integration as BaseIntegration;
}

export async function startWizard<M extends IStep>(
  argv: Args,
  ...steps: Array<{ new (debug: Args): M }>
): Promise<Answers> {
  try {
    sanitizeAndValidateArgs(argv as Args & Record<string, unknown>);
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
  } catch (e: unknown) {
    BottomBar.hide();
    nl();
    red('Sentry Wizard failed with:');
    red(argv.debug && e instanceof Error ? e.message : String(e));
    nl();
    red('Protip: Add --debug to see whats going on');
    red('OR use --help to see your options');
    process.exit(1);
  }
}
