import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TemplateVariables {
  DSN: string;
  ORG_SLUG: string;
  PROJECT_ID: string;
  SENTRY_URL: string;
  PERFORMANCE_OPTIONS: string;
  USE_CLIENT: string;
  ISSUES_PAGE_LINK: string;
  WITH_SENTRY_CONFIG_OPTIONS: string;
  TUNNEL_ROUTE_COMMENT: string;
  TUNNEL_ROUTE_CONFIG: string;
  IMPORT_PATH: string;
  INTEGRATIONS_OPTIONS: string;
  REPLAY_OPTIONS: string;
  LOGS_OPTIONS: string;
}

export class NextjsTemplateLoader {
  private templateBasePath: string;

  constructor() {
    this.templateBasePath = path.join(
      __dirname,
      '../../scripts/NextJs/templates',
    );
  }

  private processTemplate(
    templateContent: string,
    variables: Partial<TemplateVariables>,
  ): string {
    return templateContent
      .replace(/___DSN___/g, variables.DSN ?? '')
      .replace(/___ORG_SLUG___/g, variables.ORG_SLUG ?? '')
      .replace(/___PROJECT_ID___/g, variables.PROJECT_ID ?? '')
      .replace(/___SENTRY_URL___/g, variables.SENTRY_URL ?? '')
      .replace(
        /___PERFORMANCE_OPTIONS___/g,
        variables.PERFORMANCE_OPTIONS ?? '',
      )
      .replace(/___USE_CLIENT___/g, variables.USE_CLIENT ?? '')
      .replace(/___ISSUES_PAGE_LINK___/g, variables.ISSUES_PAGE_LINK ?? '')
      .replace(
        /___WITH_SENTRY_CONFIG_OPTIONS___/g,
        variables.WITH_SENTRY_CONFIG_OPTIONS ?? '',
      )
      .replace(
        /___TUNNEL_ROUTE_COMMENT___/g,
        variables.TUNNEL_ROUTE_COMMENT ?? '',
      )
      .replace(
        /___TUNNEL_ROUTE_CONFIG___/g,
        variables.TUNNEL_ROUTE_CONFIG ?? '',
      )
      .replace(
        /___INTEGRATIONS_OPTIONS___/g,
        variables.INTEGRATIONS_OPTIONS ?? '',
      )
      .replace(/___REPLAY_OPTIONS___/g, variables.REPLAY_OPTIONS ?? '')
      .replace(/___LOGS_OPTIONS___/g, variables.LOGS_OPTIONS ?? '')
      .replace(/___IMPORT_PATH___/g, variables.IMPORT_PATH ?? '');
  }

  public loadTemplate(
    templatePath: string,
    variables: Partial<TemplateVariables>,
  ): string {
    const fullPath = path.join(this.templateBasePath, templatePath);
    const templateContent = fs.readFileSync(fullPath, 'utf8');
    return this.processTemplate(templateContent, variables);
  }

  public getSentryServerConfig(
    isTypeScript: boolean,
    variables: Partial<TemplateVariables>,
  ): string {
    const extension = isTypeScript ? 'ts' : 'js';
    return this.loadTemplate(
      `configs/sentry.server.config.${extension}.template`,
      variables,
    );
  }

  public getSentryEdgeConfig(
    isTypeScript: boolean,
    variables: Partial<TemplateVariables>,
  ): string {
    const extension = isTypeScript ? 'ts' : 'js';
    return this.loadTemplate(
      `configs/sentry.edge.config.${extension}.template`,
      variables,
    );
  }

  public getSimpleExamplePage(
    isTypeScript: boolean,
    useAppRouter: boolean,
    variables: Partial<TemplateVariables>,
  ): string {
    const extension = isTypeScript ? 'tsx' : 'jsx';
    const routerType = useAppRouter ? 'app-router' : 'pages-router';
    const fileName = useAppRouter ? 'page' : 'example-page';
    return this.loadTemplate(
      `examples/simple/${routerType}/${fileName}.${extension}.template`,
      variables,
    );
  }

  public getNextjsConfig(
    format: 'cjs' | 'mjs' | 'cjs-appendix' | 'esm-snippet',
    variables: Partial<TemplateVariables>,
  ): string {
    return this.loadTemplate(
      `next-config/next.config.${format}.template`,
      variables,
    );
  }

  public getWithSentryConfigOptions(
    variables: Partial<TemplateVariables>,
  ): string {
    return this.loadTemplate(
      'configs/with-sentry-config-options.template',
      variables,
    );
  }

  public getInstrumentationHook(
    isTypeScript: boolean,
    variables: Partial<TemplateVariables>,
  ): string {
    const extension = isTypeScript ? 'ts' : 'js';
    return this.loadTemplate(
      `configs/instrumentation.${extension}.template`,
      variables,
    );
  }

  public getInstrumentationClient(
    isTypeScript: boolean,
    variables: Partial<TemplateVariables>,
  ): string {
    const extension = isTypeScript ? 'ts' : 'js';
    return this.loadTemplate(
      `configs/instrumentation-client.${extension}.template`,
      variables,
    );
  }

  public getErrorPage(
    type: 'underscore-error' | 'global-error',
    isTypeScript: boolean,
    variables: Partial<TemplateVariables>,
  ): string {
    const extension = isTypeScript ? 'ts' : 'js';
    const fileName = type === 'underscore-error' ? '_error' : 'global-error';
    return this.loadTemplate(
      `error-pages/${fileName}.${extension}.template`,
      variables,
    );
  }

  public getRootLayout(
    withMetadata: boolean,
    isTypeScript: boolean,
    variables: Partial<TemplateVariables>,
  ): string {
    const extension = isTypeScript ? 'ts' : 'js';
    const fileName = withMetadata ? 'root-layout-with-metadata' : 'root-layout';
    return this.loadTemplate(
      `layouts/${fileName}.${extension}.template`,
      variables,
    );
  }

  public getExampleApiRoute(
    useAppRouter: boolean,
    isTypeScript: boolean,
    variables: Partial<TemplateVariables>,
  ): string {
    const extension = isTypeScript ? 'ts' : 'js';
    const fileName = useAppRouter ? 'route' : 'api-route';
    const routerType = useAppRouter ? 'app-router' : 'pages-router';
    return this.loadTemplate(
      `examples/simple/${routerType}/api/${fileName}.${extension}.template`,
      variables,
    );
  }
}
