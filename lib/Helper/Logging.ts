import Chalk from 'chalk';

function prepareMessage(msg: any) {
  if (typeof msg === 'string') {
    return msg;
  }
  if (msg instanceof Error) {
    return `${msg.stack || ''}`;
  }
  return JSON.stringify(msg, null, '\t');
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
