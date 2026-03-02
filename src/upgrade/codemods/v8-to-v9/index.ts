import type { CodemodTransform } from '../../types.js';
import { packageRemapping } from './package-remapping.js';
import { hubRemoval } from './hub-removal.js';
import { methodRenames } from './method-renames.js';
import { configChanges } from './config-changes.js';

export const v8ToV9Codemods: CodemodTransform[] = [
  packageRemapping,
  hubRemoval,
  methodRenames,
  configChanges,
];
