import * as fs from 'fs';
import * as path from 'path';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import clack from '@clack/prompts';
import {
  getIndexRouteTemplate,
  getSentryExampleApiTemplate,
  getSentryExamplePageTemplate,
  getSentryErrorButtonTemplate,
} from './templates';
import { abort, isUsingTypeScript } from '../utils/clack';
import pc from 'picocolors';
import * as Sentry from '@sentry/node';

function getSrcDirectory(isNuxtV4: boolean) {
  // In nuxt v4, the src directory is `app/` unless
  // users already had a `pages` directory
  return isNuxtV4 && !fs.existsSync(path.resolve('pages')) ? 'app' : '.';
}

export async function supportsExamplePage(isNuxtV4: boolean) {
  // We currently only support creating an example page
  // if users can reliably access it without having to
  // add code changes themselves.
  //
  // If users have an `app.vue` layout without the
  // needed component to render routes (<NuxtPage/>),
  // we bail out of creating an example page altogether.
  const src = getSrcDirectory(isNuxtV4);
  const app = path.join(src, 'app.vue');

  // If there's no `app.vue` layout, nuxt automatically renders
  // the routes.
  if (!fs.existsSync(path.resolve(app))) {
    return true;
  }

  const content = await fs.promises.readFile(path.resolve(app), 'utf8');
  return !!content.match(/<NuxtPage/g);
}

export async function createExamplePage(
  isNuxtV4: boolean,
  options: {
    org: string;
    project: string;
    projectId: string;
    url: string;
  },
) {
  try {
    const src = getSrcDirectory(isNuxtV4);
    const pages = path.join(src, 'pages');

    if (!fs.existsSync(path.resolve(pages))) {
      fs.mkdirSync(path.resolve(pages), { recursive: true });

      const indexPage = path.join(pages, 'index.vue');

      await fs.promises.writeFile(
        path.resolve(indexPage),
        getIndexRouteTemplate(),
      );

      clack.log.success(`Created ${pc.cyan(indexPage)}.`);
    }

    const examplePage = path.join(pages, 'sentry-example-page.vue');

    if (fs.existsSync(path.resolve(examplePage))) {
      clack.log.warn(
        `It seems like a sentry example page already exists. Skipping creation of example page.`,
      );
      return;
    }

    await fs.promises.writeFile(
      path.resolve(examplePage),
      getSentryExamplePageTemplate(options),
    );

    clack.log.success(`Created ${pc.cyan(examplePage)}.`);

    const api = path.join('server', 'api');

    if (!fs.existsSync(path.resolve(api))) {
      fs.mkdirSync(path.resolve(api), { recursive: true });
    }

    const exampleApi = path.join(
      api,
      isUsingTypeScript() ? 'sentry-example-api.ts' : 'sentry-example-api.js',
    );

    await fs.promises.writeFile(
      path.resolve(exampleApi),
      getSentryExampleApiTemplate(),
    );

    clack.log.success(`Created ${pc.cyan(exampleApi)}.`);
  } catch (e: unknown) {
    clack.log.error('Error while creating an example page to test Sentry:');
    clack.log.info(
      pc.dim(
        typeof e === 'object' && e != null && 'toString' in e
          ? e.toString()
          : typeof e === 'string'
          ? e
          : 'Unknown error',
      ),
    );
    Sentry.captureException(
      'Error while creating an example Nuxt page to test Sentry',
    );
    await abort('Exiting Wizard');
  }
}

export async function createExampleComponent(isNuxtV4: boolean) {
  const src = getSrcDirectory(isNuxtV4);
  const components = path.join(src, 'components');

  if (!fs.existsSync(path.resolve(components))) {
    fs.mkdirSync(path.resolve(components), { recursive: true });
  }

  const exampleComponent = path.join(components, 'SentryErrorButton.vue');

  await fs.promises.writeFile(
    path.resolve(exampleComponent),
    getSentryErrorButtonTemplate(),
  );

  clack.log.success(`Created ${pc.cyan(exampleComponent)}.`);
}
