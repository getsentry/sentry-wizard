export type Config = {
  organization?: { slug?: string };
  project?: { slug?: string };
  dsn?: { public?: string };
  auth?: { token?: string };
};
