import * as fs from 'node:fs';
import * as path from 'node:path';
import xml from 'xml-js';

type SnapshotVerificationSchemeOptions = {
  hostedTestTargetName: string;
  xcodeprojPath: string;
};

type ExplicitScheme = {
  name: string;
  testTargetNames: string[];
};

export function resolveSnapshotVerificationSchemeName({
  hostedTestTargetName,
  xcodeprojPath,
}: SnapshotVerificationSchemeOptions): string | undefined {
  try {
    const explicitSchemes = getExplicitSchemes(xcodeprojPath);
    const matchingExplicitSchemes = explicitSchemes.filter((scheme) =>
      scheme.testTargetNames.includes(hostedTestTargetName),
    );
    const matchingExplicitSchemeNames = uniqueStrings(
      matchingExplicitSchemes.map((scheme) => scheme.name),
    );
    if (matchingExplicitSchemeNames.length === 1) {
      return matchingExplicitSchemeNames[0];
    }

    const explicitSchemeNames = uniqueStrings(
      explicitSchemes.map((scheme) => scheme.name),
    );
    if (explicitSchemeNames.length === 1) {
      return explicitSchemeNames[0];
    }

    const managedSchemeNames = getManagedSchemeNames(xcodeprojPath);
    if (managedSchemeNames.length === 1) {
      return managedSchemeNames[0];
    }

    return undefined;
  } catch {
    return undefined;
  }
}

function getExplicitSchemes(xcodeprojPath: string): ExplicitScheme[] {
  return getSchemeFilePaths(xcodeprojPath).flatMap((schemePath) => {
    const schemeName = path.basename(schemePath, '.xcscheme');
    const testTargetNames = readSchemeTestTargetNames(schemePath);
    return schemeName ? [{ name: schemeName, testTargetNames }] : [];
  });
}

function getSchemeFilePaths(xcodeprojPath: string): string[] {
  return [
    path.join(xcodeprojPath, 'xcshareddata', 'xcschemes'),
    path.join(xcodeprojPath, 'xcuserdata'),
  ].flatMap((schemeDirectory) =>
    findFilesWithExtension(schemeDirectory, '.xcscheme'),
  );
}

function readSchemeTestTargetNames(schemePath: string): string[] {
  try {
    const scheme = xml.xml2js(fs.readFileSync(schemePath, 'utf8'), {
      compact: true,
    });
    const testAction = getChild(getChild(scheme, 'Scheme'), 'TestAction');
    const targetNames = new Set<string>();
    collectBlueprintNames(testAction, targetNames);
    return [...targetNames];
  } catch {
    return [];
  }
}

function getManagedSchemeNames(xcodeprojPath: string): string[] {
  return uniqueStrings(
    findFilesWithName(xcodeprojPath, 'xcschememanagement.plist').flatMap(
      readManagedSchemeNames,
    ),
  );
}

function readManagedSchemeNames(plistPath: string): string[] {
  try {
    const plist = xml.xml2js(fs.readFileSync(plistPath, 'utf8'), {
      compact: true,
    });
    return collectElementText(plist, 'key').flatMap(parseManagedSchemeName);
  } catch {
    return [];
  }
}

function parseManagedSchemeName(key: string): string[] {
  const match = /^(.+)\.xcscheme(?:_.+)?$/.exec(key);
  return match ? [match[1]] : [];
}

function findFilesWithExtension(
  directory: string,
  extension: string,
): string[] {
  return findFiles(directory, (filePath) => filePath.endsWith(extension));
}

function findFilesWithName(directory: string, fileName: string): string[] {
  return findFiles(
    directory,
    (filePath) => path.basename(filePath) === fileName,
  );
}

function findFiles(
  directory: string,
  predicate: (filePath: string) => boolean,
): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          return findFiles(entryPath, predicate);
        }

        return predicate(entryPath) ? [entryPath] : [];
      });
  } catch {
    return [];
  }
}

function getChild(node: unknown, childName: string): unknown {
  return isRecord(node) ? node[childName] : undefined;
}

function collectBlueprintNames(node: unknown, targetNames: Set<string>): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectBlueprintNames(item, targetNames));
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  const attributes = node._attributes;
  if (isRecord(attributes) && typeof attributes.BlueprintName === 'string') {
    targetNames.add(attributes.BlueprintName);
  }

  Object.values(node).forEach((value) =>
    collectBlueprintNames(value, targetNames),
  );
}

function collectElementText(node: unknown, elementName: string): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectElementText(item, elementName));
  }

  if (!isRecord(node)) {
    return [];
  }

  return Object.entries(node).flatMap(([key, value]) => {
    const childText = key === elementName ? collectTextValues(value) : [];
    return childText.concat(collectElementText(value, elementName));
  });
}

function collectTextValues(node: unknown): string[] {
  if (Array.isArray(node)) {
    return node.flatMap(collectTextValues);
  }

  if (!isRecord(node)) {
    return [];
  }

  return typeof node._text === 'string' ? [node._text] : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
