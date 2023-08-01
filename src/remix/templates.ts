export const ERROR_BOUNDARY_TEMPLATE_V2 = `const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};
`;

export const HANDLE_ERROR_TEMPLATE_V2 = `function handleError(error) {
  if (error instanceof Error) {
    Sentry.captureRemixErrorBoundaryError(error);
  } else {
    Sentry.captureException(error);
  }
}
`;
