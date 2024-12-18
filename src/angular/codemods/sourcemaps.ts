/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

// @ts-ignore - clack is ESM and TS complains about that. It works though
import * as clack from '@clack/prompts';
import * as path from 'path';
import * as fs from 'fs';
import { configureAngularSourcemapGenerationFlow } from '../../sourcemaps/tools/angular';

export async function addSourcemapEntryToAngularJSON(): Promise<void> {
  const angularJsonPath = path.join(process.cwd(), 'angular.json');
  const angularJSONFile = fs.readFileSync(angularJsonPath, 'utf-8');
  const angularJson = JSON.parse(angularJSONFile);

  if (!angularJson) {
    await configureAngularSourcemapGenerationFlow();
  }

  const projects = Object.keys(angularJson.projects as Record<string, unknown>);

  if (!projects.length) {
    await configureAngularSourcemapGenerationFlow();
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

  clack.log.info(
    'Added sourcemap configuration to angular.json for all projects',
  );
}
