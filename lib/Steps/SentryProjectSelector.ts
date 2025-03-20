import type { Answers } from 'inquirer';
import { prompt } from 'inquirer';

import { BaseStep } from './BaseStep';

type Project = {
  id: string;
  slug: string;
  organization?: {
    name: string;
    slug: string;
  };
  keys: {
    dsn: {
      public: string;
      private: string;
    };
  }[];
};

type Wizard = {
  projects: Project[];
  apiKeys: {
    token: string;
  };
};

type Config = {
  organization?: { slug?: string | null };
  project?: { id?: string | null; slug?: string | null };
  dsn?: { public?: string | null; private?: string | null };
  auth?: { token?: string | null };
};

function sleep(n: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, n));
}

export class SentryProjectSelector extends BaseStep {
  public async emit(
    answers: Answers & { wizard?: Wizard },
  ): Promise<{ config?: Config }> {
    this.debug(answers);

    if (!answers.wizard) {
      // we skip this completely because the wizard wasn't running
      return {};
    }

    if (!answers.wizard.projects || answers.wizard.projects.length === 0) {
      throw new Error(
        'No Projects found. Please create a new Project in Sentry and try again.',
      );
    }

    let selectedProject: { selectedProject: Project } | null = null;
    if (answers.wizard.projects.length === 1) {
      selectedProject = {
        selectedProject: answers.wizard.projects[0],
      };
      // the wizard CLI closes too quickly when we skip the prompt
      // as it will cause the UI to be stuck saying Waiting for wizard to connect
      await sleep(1000);
    } else {
      selectedProject = await prompt([
        {
          choices: answers.wizard.projects.map((project: Project) => {
            return {
              name: `${project.organization?.name ?? ''} / ${project.slug}`,
              value: project,
            };
          }),
          message: 'Please select your project in Sentry:',
          name: 'selectedProject',
          type: 'list',
        },
      ]);
    }
    const dsn = selectedProject?.selectedProject.keys[0]?.dsn ?? {
      public: null,
      private: null,
    };
    return {
      config: {
        auth: {
          token: answers.wizard.apiKeys?.token ?? null,
        },
        dsn,
        organization: {
          slug: selectedProject?.selectedProject.organization?.slug ?? null,
        },
        project: {
          id: selectedProject?.selectedProject.id ?? null,
          slug: selectedProject?.selectedProject.slug ?? null,
        },
      },
    };
  }
}
