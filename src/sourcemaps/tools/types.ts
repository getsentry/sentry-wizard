export type SourceMapUploadToolConfigurationOptions = {
  selfHosted: boolean;
  url: string;
  authToken: string;
  orgSlug: string;
  projectSlug: string;
};

export type SourceMapUploadToolConfigurationFunction = (
  options: SourceMapUploadToolConfigurationOptions,
) => Promise<void>;
