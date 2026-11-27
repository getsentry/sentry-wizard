// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

export interface SentryCLIConfiguration {
  auth_token: string;
  org: string;
  project: string;
}

export function createSentryCLIRC(
  directory: string,
  params: SentryCLIConfiguration,
) {
  const rcPath = path.join(directory, '.sentryclirc');
  fs.writeFileSync(
    rcPath,
    `[defaults]\norg=${params.org}\nproject=${params.project}\n\n[auth]\ntoken=${params.auth_token}\n`,
  );

  const gitignorePath = path.join(directory, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    clack.log.info(
      `Creating .gitignore file at path: ${chalk.cyan(gitignorePath)}`,
    );
    fs.writeFileSync(gitignorePath, '.sentryclirc');
  } else {
    const gitIgnore = fs.readFileSync(gitignorePath).toString();
    if (!gitIgnore.includes('.sentryclirc')) {
      clack.log.info(
        `Appending .sentryclirc to .gitignore file at path: ${chalk.cyan(
          gitignorePath,
        )}`,
      );
      fs.appendFileSync(gitignorePath, '\n.sentryclirc\n');
    }
  }
}
