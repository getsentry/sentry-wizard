import Chalk from 'chalk';
import {Answers, ui} from 'inquirer';
import {Step, BaseStep} from './steps/Step';

function prepareMessage(msg: any) {
  if (typeof msg === 'string') {
    return msg;
  }
  return JSON.stringify(msg);
}

export function l(msg: string) {
  console.log(msg);
}

export function nl() {
  return l('');
}

export function green(msg: string) {
  return l(Chalk.green(prepareMessage(msg)));
}

export function dim(msg: string) {
  return l(Chalk.dim(prepareMessage(msg)));
}

export function debug(msg: any) {
  return l(Chalk.italic.yellow(prepareMessage(msg)));
}

export class BottomBar {
  static bar: any;
  static interval: NodeJS.Timer;

  static show(msg: any) {
    let loader = ['/', '|', '\\', '-'];
    let i = 4;
    BottomBar.bar = new ui.BottomBar({bottomBar: loader[i % 4]});
    BottomBar.interval = setInterval(() => {
      BottomBar.bar.updateBottomBar(`${loader[i++ % 4]} ${msg}`);
    }, (Math.random() * 300 + 50));
  }

  static hide() {
    clearInterval(BottomBar.interval);
    BottomBar.bar.updateBottomBar('');
    nl();
    BottomBar.bar.close();
  }
}

export function startWizard<M extends Step>(argv: any,
  ...steps: {new (debug: boolean): M}[]
): Promise<Answers> {
  if (argv.debug) console.log(argv);
  return steps.map(step => new step(argv)).reduce(async (answer, step) => {
    let prevAnswer = await answer;
    let answers = await step.emit(prevAnswer);
    return Promise.resolve(Object.assign({}, prevAnswer, answers));
  }, Promise.resolve({}));
}
