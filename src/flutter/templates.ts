export const sentryImport = `import 'package:sentry_flutter/sentry_flutter.dart';\n`;

export function pubspecOptions(project: string, org: string): string {
  return `sentry:
  upload_source_maps: true
  upload_sources: true
  project: ${project}
  org: ${org}
`
}

export function sentryProperties(authToken: string): string {
  return `auth_token=${authToken}`;
}
