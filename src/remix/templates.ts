export const ERROR_BOUNDARY_TEMPLATE_V2 = `const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};
`;

export const HANDLE_ERROR_TEMPLATE_V2 = `const handleError = Sentry.wrapHandleErrorWithSentry((error, { request }) => {
  // Custom handleError implementation
});
`;
