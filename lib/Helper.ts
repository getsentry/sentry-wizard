import Chalk from 'chalk';
import { Answers, ui } from 'inquirer';
import { IArgs } from './Constants';
import { BaseStep, IStep } from './steps/Step';

function prepareMessage(msg: any) {
  if (typeof msg === 'string') {
    return msg;
  }
  return JSON.stringify(msg);
}

export function l(msg: string) {
  // tslint:disable-next-line
  console.log(msg);
}

export function nl() {
  return l('');
}

export function green(msg: string) {
  return l(Chalk.green(prepareMessage(msg)));
}

export function red(msg: string) {
  return l(Chalk.red(prepareMessage(msg)));
}

export function dim(msg: string) {
  return l(Chalk.dim(prepareMessage(msg)));
}

export function debug(msg: any) {
  return l(Chalk.italic.yellow(prepareMessage(msg)));
}

export class BottomBar {
  public static bar: any;
  public static interval: NodeJS.Timer;

  public static show(msg: any) {
    const loader = ['/', '|', '\\', '-'];
    let i = 4;
    BottomBar.bar = new ui.BottomBar({ bottomBar: loader[i % 4] });
    BottomBar.interval = setInterval(() => {
      BottomBar.bar.updateBottomBar(`${loader[i++ % 4]} ${msg}`);
    }, 100);
  }

  public static hide() {
    clearInterval(BottomBar.interval);
    BottomBar.bar.updateBottomBar('');
    nl();
    BottomBar.bar.close();
  }
}

function sanitizeArgs(argv: IArgs) {
  let baseUrl = argv.url;
  baseUrl += baseUrl.endsWith('/') ? '' : '/';
  argv.url = baseUrl;
}

export async function startWizard<M extends IStep>(
  argv: IArgs,
  ...steps: Array<{ new (debug: IArgs): M }>
) {
  sanitizeArgs(argv);
  if (argv.debug) {
    debug(argv);
  }

  try {
    await steps.map(step => new step(argv)).reduce(async (answer, step) => {
      const prevAnswer = await answer;

      const answers = await step.emit(prevAnswer);
      return { ...prevAnswer, ...answers };
    }, Promise.resolve({}));
  } catch (e) {
    BottomBar.hide();
    nl();
    red('Sentry Setup Wizard failed with:');
    nl();
    red(e);
  }
}
