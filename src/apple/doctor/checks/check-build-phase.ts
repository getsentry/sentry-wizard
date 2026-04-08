import type { PBXNativeTarget, PBXShellScriptBuildPhase } from 'xcode';
import type { XcodeProject } from '../../xcode-manager';
import type { DiagnosticResult } from '../types';

export function checkBuildPhase({
  xcProject,
  target,
}: {
  xcProject: XcodeProject;
  target: string;
}): DiagnosticResult {
  const xcObjects = xcProject.objects;

  const targetKey = Object.keys(xcObjects.PBXNativeTarget ?? {}).find((key) => {
    const value = xcObjects.PBXNativeTarget?.[key];
    return (
      !key.endsWith('_comment') &&
      typeof value !== 'string' &&
      value?.name === target
    );
  });

  if (!targetKey) {
    return {
      name: 'dSYM Upload Build Phase',
      status: 'fail',
      message: `Target "${target}" not found in project.`,
      fixAvailable: false,
    };
  }

  const nativeTarget = xcObjects.PBXNativeTarget?.[
    targetKey
  ] as PBXNativeTarget;

  let sentryBuildPhase: PBXShellScriptBuildPhase | undefined;
  for (const phase of nativeTarget.buildPhases ?? []) {
    const bp = xcObjects.PBXShellScriptBuildPhase?.[phase.value];
    if (typeof bp !== 'string' && bp?.shellScript?.includes('sentry-cli')) {
      sentryBuildPhase = bp;
      break;
    }
  }

  if (!sentryBuildPhase) {
    return {
      name: 'dSYM Upload Build Phase',
      status: 'fail',
      message:
        'No Sentry dSYM upload build phase found in target. Re-run the wizard to add it.',
      fixAvailable: false,
    };
  }

  const issues: string[] = [];
  const script = sentryBuildPhase.shellScript ?? '';

  if (!script.includes('SENTRY_ORG')) {
    issues.push('Missing SENTRY_ORG');
  }
  if (!script.includes('SENTRY_PROJECT')) {
    issues.push('Missing SENTRY_PROJECT');
  }

  if (issues.length === 0) {
    return {
      name: 'dSYM Upload Build Phase',
      status: 'pass',
      message: 'Sentry dSYM upload build phase is correctly configured.',
      fixAvailable: false,
    };
  }

  return {
    name: 'dSYM Upload Build Phase',
    status: 'warn',
    message: `Issues found: ${issues.join('; ')}`,
    fixAvailable: false,
  };
}
