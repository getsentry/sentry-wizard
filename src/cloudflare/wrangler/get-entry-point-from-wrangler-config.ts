import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'jsonc-parser';
import { findWranglerConfig } from './find-wrangler-config';

/**
 * Reads the main entry point from the wrangler config file
 * Returns undefined if no config exists or if main field is not specified
 */
export function getEntryPointFromWranglerConfig(): string | undefined {
  const configFile = findWranglerConfig();

  if (!configFile) {
    return undefined;
  }

  const configPath = path.join(process.cwd(), configFile);
  const configContent = fs.readFileSync(configPath, 'utf-8');
  const extname = path.extname(configFile);

  switch (extname) {
    case '.toml': {
      const mainMatch = configContent.match(/^main\s*=\s*["'](.+)["']/m);

      return mainMatch ? mainMatch[1] : undefined;
    }

    case '.json':
    case '.jsonc':
      try {
        const config = parse(configContent) as { main?: string };

        return config.main;
      } catch {
        return undefined;
      }

    default:
      return undefined;
  }
}
