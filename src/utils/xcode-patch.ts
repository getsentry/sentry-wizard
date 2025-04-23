import { project as PbxProject } from 'xcode';
// @ts-expect-error - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';

interface PbxProjectType {
  prototype: {
    generateUuid: () => string;
    allUuids: () => string[];
  };
}

const pbxProject = PbxProject as unknown as PbxProjectType;

// Save the original method
const originalGenerateUuid = pbxProject.prototype.generateUuid;

// Function to apply the patch
export function applyXcodePatching(): void {
  pbxProject.prototype.generateUuid = function (this: {
    allUuids: () => string[];
  }): string {
    // Create a deterministic ID without even trying random generation
    const base =
      Date.now().toString(36) + Math.random().toString(36).substring(2);
    const id = base
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .substr(0, 24);
    clack.log.info('Generated UUID');
    return id;
  };
}

// Function to restore the original implementation
export function restoreXcodePatching(): void {
  pbxProject.prototype.generateUuid = originalGenerateUuid;
}

// Wrap the execution with patching and automatic restoration
export function withXcodePatch<T>(callback: () => T): T {
  try {
    applyXcodePatching();
    return callback();
  } finally {
    restoreXcodePatching();
  }
}
