import { Args } from '../../lib/Constants';
import { SentryCli } from '../../lib/Helper/SentryCli';
import { SentryProjectData } from '../utils/types';

export async function setupCLIConfig(
  authToken: string,
  selectedProject: SentryProjectData,
  sentryUrl: string,
): Promise<void> {
  const cli = new SentryCli({ url: sentryUrl } as Args);

  const answers = {
    config: {
      organization: {
        slug: selectedProject.organization.slug,
      },
      project: {
        slug: selectedProject.slug,
      },
      auth: {
        token: authToken,
      },
    },
  };
  const props = cli.convertAnswersToProperties(answers);
  await cli.createSentryCliConfig(props);
}
