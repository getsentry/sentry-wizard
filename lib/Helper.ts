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

export function bottomBarLoader(msg: any): [any, NodeJS.Timer] {
  let loader = ['/', '|', '\\', '-'];
  let i = 4;
  let bottomBar = new ui.BottomBar({bottomBar: loader[i % 4]});
  let interval = setInterval(function() {
    bottomBar.updateBottomBar(`${loader[i++ % 4]} ${msg}`);
  }, (Math.random() * 300 + 50));
  return [bottomBar, interval];
}

export function startWizard<M extends Step>(argv: any,
  ...steps: {new (debug: boolean): M}[]
): Promise<Answers> {
  if (argv.debug) console.log(argv);
  return steps.map(step => new step(argv.debug)).reduce(async (answer, step) => {
    let prevAnswer = await answer;
    let answers = await step.emit(prevAnswer);
    return Promise.resolve(Object.assign({}, prevAnswer, answers));
  }, Promise.resolve({}));
}
