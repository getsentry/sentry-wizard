import * as recast from 'recast';
import x = recast.types;
import t = x.namedTypes;

export interface CodemodTransform {
  name: string;
  description: string;
  transform(ctx: TransformContext): CodemodResult;
}

export interface TransformContext {
  program: t.Program;
  filePath: string;
  sourceCode: string;
}

export interface CodemodResult {
  modified: boolean;
  changes: string[];
  manualReviewItems: ManualReviewItem[];
}

export interface ManualReviewItem {
  file: string;
  line: number;
  description: string;
}

export interface SentryPackageInfo {
  name: string;
  version: string;
}

export interface RemovedPackageInfo {
  name: string;
  removedInVersion: number;
}

export interface VersionDetectionResult {
  majorVersion: number | null;
  packages: SentryPackageInfo[];
  hasRemovedPackages: RemovedPackageInfo[];
}
