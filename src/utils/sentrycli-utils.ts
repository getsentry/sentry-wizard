// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as fs from 'fs';
import * as path from 'path';

export interface SentryCLIConfiguration {
  auth_token: string;
}

export function createSentryCLIRC(
  directory: string,
  params: SentryCLIConfiguration,
) {
  const rcPath = path.join(directory, '.sentryclirc');
  fs.writeFileSync(rcPath, '[auth]\ntoken=' + params.auth_token);

  if (!fs.existsSync('.gitignore')) {
    fs.writeFileSync('.gitignore', '.sentryclirc');
  } else {
    const gitIgnore = fs.readFileSync('.gitignore').toString();
    if (!gitIgnore.includes('.sentryclirc')) {
      fs.appendFileSync('.gitignore', '\n.sentryclirc');
    }
  }
}
