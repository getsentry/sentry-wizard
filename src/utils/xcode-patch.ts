import { project as PbxProject } from 'xcode';
import { v4 as uuidv4 } from 'uuid';

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
    const existingUuids = this.allUuids();

    // Try up to 1000 times to get a unique ID
    for (let i = 0; i < 50; i++) {
      const id = uuidv4().replace(/-/g, '').substr(0, 24).toUpperCase();

      if (existingUuids.indexOf(id) < 0) {
        return id;
      }
    }

    // Fallback to timestamp-based ID if random ones keep colliding
    const timestamp = Date.now().toString(16).padStart(12, '0').toUpperCase();
    const random = Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(12, '0')
      .toUpperCase();
    return (timestamp + random).substr(0, 24);
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
