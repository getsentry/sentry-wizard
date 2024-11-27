import { gte, minVersion } from 'semver';
// @ts-expect-error - magicast is ESM and TS complains about that. It works though
import { loadFile } from 'magicast';

export async function isNuxtV4(
  nuxtConfig: string,
  packageVersion: string | undefined,
) {
  if (!packageVersion) {
    return false;
  }

  const minVer = minVersion(packageVersion);
  if (minVer && gte(minVer, '4.0.0')) {
    return true;
  }

  // At the time of writing, nuxt 4 is not on its own
  // major yet. We must read the `compatibilityVersion`
  // from the nuxt config.
  const mod = await loadFile(nuxtConfig);
  const config =
    mod.exports.default.$type === 'function-call'
      ? mod.exports.default.$args[0]
      : mod.exports.default;

  if (config && config.future && config.future.compatibilityVersion === 4) {
    return true;
  }

  return false;
}
