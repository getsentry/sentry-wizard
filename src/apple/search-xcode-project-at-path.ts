import * as fs from 'fs';
import * as path from 'path';

import { debug } from '../utils/debug';
import { findFilesWithExtension } from '../utils/find-files-with-extension';

export function searchXcodeProjectAtPath(searchPath: string): string[] {
  debug('Searching for Xcode project at path: ' + searchPath);
  const projs = findFilesWithExtension(searchPath, '.xcodeproj');
  if (projs.length > 0) {
    debug('Found Xcode project at paths:');
    projs.forEach((proj) => debug('  ' + proj));
    return projs;
  }

  debug('Searching for Xcode workspace at path: ' + searchPath);
  const workspace = findFilesWithExtension(searchPath, '.xcworkspace');
  if (workspace.length == 0) {
    debug('No Xcode workspace found at path: ' + searchPath);
    return [];
  }

  debug('Found Xcode workspace at path: ' + workspace[0]);
  const xsworkspacedata = path.join(
    searchPath,
    workspace[0],
    'contents.xcworkspacedata',
  );
  if (!fs.existsSync(xsworkspacedata)) {
    debug('No Xcode workspace data found at path: ' + xsworkspacedata);
    return [];
  }

  debug('Parsing Xcode workspace data at path: ' + xsworkspacedata);
  const groupRegex = /location *= *"group:([^"]+)"/gim;
  const content = fs.readFileSync(xsworkspacedata, 'utf8');
  let matches = groupRegex.exec(content);

  while (matches) {
    const group = matches[1];
    const groupPath = path.join(searchPath, group);
    if (
      !group.endsWith('Pods.xcodeproj') &&
      group.endsWith('.xcodeproj') &&
      fs.existsSync(groupPath)
    ) {
      projs.push(group);
    }
    matches = groupRegex.exec(content);
  }

  debug('Found Xcode project at paths:');
  projs.forEach((proj) => debug('  ' + proj));
  return projs;
}
