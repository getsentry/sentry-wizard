// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import * as Sentry from '@sentry/node';
import chalk from 'chalk';
import { traceStep } from '../telemetry';
import { debug } from '../utils/debug';
import * as codeTools from './code-tools';
import { XcodeProject } from './xcode-manager';

export function injectCodeSnippet({
  project,
  target,
  dsn,
}: {
  project: XcodeProject;
  target: string;
  dsn: string;
}) {
  debug(
    `Injecting code snippet into project at path: ${chalk.cyan(
      project.projectPath,
    )}`,
  );
  const codeAdded = traceStep('Add code snippet', () => {
    const files = project.filesForTarget(target);
    if (files === undefined || files.length == 0) {
      Sentry.setTag('snippet-candidate-files-not-found', true);
      return false;
    }

    return codeTools.addCodeSnippetToProject(project.projectPath, files, dsn);
  });
  Sentry.setTag('Snippet-Added', codeAdded);
  debug(`Snippet added: ${chalk.cyan(codeAdded.toString())}`);

  if (!codeAdded) {
    clack.log.warn(
      'Added the Sentry dependency to your project but could not add the Sentry code snippet. Please add the code snippet manually by following the docs: https://docs.sentry.io/platforms/apple/guides/ios/#configure',
    );
  }
}
