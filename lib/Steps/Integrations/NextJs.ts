import * as fs from 'fs';
import { Answers, prompt, Question } from 'inquirer';
import * as _ from 'lodash';
import * as path from 'path';
import { Args } from '../../Constants';
import { debug, dim, green, l, nl, red } from '../../Helper/Logging';
import { SentryCli } from '../../Helper/SentryCli';
import { BaseIntegration } from './BaseIntegration';

const MIN_NEXTJS_VERSION = '10.0.0';

const CODE_EXAMPLE = `import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: '___DSN___',
});`;

let appPackage: any = {};

function printExample(example: string, title: string = ''): void {
  if (title) {
    l(title);
  }

  nl();
  dim(example.replace(/^/gm, '    '));
  nl();
}

try {
  appPackage = require(path.join(process.cwd(), 'package.json'));
} catch {
  // We don't need to have this
}

export class NextJs extends BaseIntegration {
  protected sentryCli: SentryCli;

  constructor(protected argv: Args) {
    super(argv);
    this.sentryCli = new SentryCli(this.argv);
  }

  public async emit(answers: Answers): Promise<Answers> {
    const dsn = _.get(answers, ['config', 'dsn', 'public'], null);
    nl();

    const sentryCliProps = this.sentryCli.convertAnswersToProperties(answers);
    fs.writeFileSync(
      './sentry.properties',
      this.sentryCli.dumpProperties(sentryCliProps),
    );
    green(`Successfully created sentry.properties`);
    nl();

    const webpackConfig = path.join(
      __dirname,
      '..',
      '..',
      '..',
      'NextJs',
      'next.config.js',
    );

    if (fs.existsSync(webpackConfig)) {
      fs.writeFileSync('next.config.js', fs.readFileSync(webpackConfig));
    } else {
      debug(
        `Couldn't find ${webpackConfig}, probably because you run from src`,
      );
    }

    printExample(
      CODE_EXAMPLE.replace('___DSN___', dsn),
      'Put these lines in to your main and renderer processes to setup Sentry:',
    );

    l(
      'For more information, see https://docs.sentry.io/platforms/javascript/guides/nextjs/',
    );
    nl();

    return {};
  }

  public async shouldConfigure(answers: Answers): Promise<Answers> {
    if (this._shouldConfigure) {
      return this._shouldConfigure;
    }

    nl();

    let userAnswers: Answers = { continue: true };
    if (!this.checkDep('next', true) && !this.argv.quiet) {
      userAnswers = await prompt({
        message:
          'There were errors during your project checkup, do you still want to continue?',
        name: 'continue',
        default: false,
        type: 'confirm',
      });
    }

    nl();

    if (!userAnswers['continue']) {
      throw new Error('Please install the required dependencies to continue.');
    }

    this._shouldConfigure = Promise.resolve({ nextjs: true });
    return this.shouldConfigure;
  }

  private checkDep(packageName: string, minVersion?: boolean): boolean {
    const depVersion = parseInt(
      _.get(appPackage, ['dependencies', packageName], '0').replace(/\D+/g, ''),
      10,
    );
    const devDepVersion = parseInt(
      _.get(appPackage, ['devDependencies', packageName], '0').replace(
        /\D+/g,
        '',
      ),
      10,
    );

    const parsedVersion = parseInt(MIN_NEXTJS_VERSION.replace(/\D+/g, ''));

    if (
      !_.get(appPackage, `dependencies.${packageName}`, false) &&
      !_.get(appPackage, `devDependencies.${packageName}`, false)
    ) {
      red(`✗ ${packageName} isn't in your dependencies`);
      red(`  please install it with yarn/npm`);
      return false;
    } else if (
      minVersion &&
      depVersion < parsedVersion &&
      devDepVersion < parsedVersion
    ) {
      red(
        `✗ Your installed version of ${packageName} is not supported, >${MIN_NEXTJS_VERSION} needed`,
      );
      return false;
    } else {
      minVersion
        ? green(`✓ ${packageName} > ${MIN_NEXTJS_VERSION} is installed`)
        : green(`✓ ${packageName} is installed`);
      return true;
    }
  }
}
