/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as path from 'path';
import * as fs from 'fs';

export function addSourcemapEntryToAngularJSON(): void {
  const angularJsonPath = path.join(process.cwd(), 'angular.json');

  const angularJSONFile = fs.readFileSync(angularJsonPath, 'utf-8');

  const angularJson = JSON.parse(angularJSONFile);

  if (!angularJson) {
    throw new Error('Could not find in angular.json in your project');
  }

  const projects = Object.keys(angularJson.projects as Record<string, unknown>);

  if (!projects.length) {
    throw new Error('Could not find any projects in angular.json');
  }

  // Emit sourcemaps from all projects in angular.json
  for (const project of projects) {
    const projectConfig = angularJson.projects[project];

    if (!projectConfig.architect) {
      projectConfig.architect = {};
    }

    if (!projectConfig.architect.build) {
      projectConfig.architect.build = {};
    }

    if (!projectConfig.architect.build.configurations) {
      projectConfig.architect.build.configurations = {};
    }

    projectConfig.architect.build.configurations.production = {
      sourceMap: true,
    };
  }

  fs.writeFileSync(angularJsonPath, JSON.stringify(angularJson, null, 2));
}
