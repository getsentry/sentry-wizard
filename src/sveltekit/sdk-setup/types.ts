export type ProjectInfo = {
  dsn: string;
  org: string;
  project: string;
  selfHosted: boolean;
  url: string;
  /** Module `sentrySvelteKit` is imported from; depends on the installed SDK major. */
  vitePluginImportPath: string;
};
