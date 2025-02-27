export const deploymentPlatforms = [
  'vercel',
  'netlify',
  'other',
  'none',
] as const;

export type DeploymentPlatform = (typeof deploymentPlatforms)[number];
