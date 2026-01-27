export const ERROR_BOUNDARY_TEMPLATE = `const ErrorBoundary = () => {
  const error = useRouteError();
  captureRemixErrorBoundaryError(error);
  return <div>Something went wrong</div>;
};
`;

export const HANDLE_ERROR_TEMPLATE = `const handleError = Sentry.wrapHandleErrorWithSentry((error, { request }) => {
  // Custom handleError implementation
});
`;

export const META_FUNCTION_TEMPLATE = `const meta = ({ data }) => [
  { name: 'sentry-trace', content: data && data.sentryTrace },
  { name: 'baggage', content: data && data.sentryBaggage },
];
`;

export const SENTRY_META_ENTRIES = [
  "{ name: 'sentry-trace', content: data && data.sentryTrace }",
  "{ name: 'baggage', content: data && data.sentryBaggage }",
];
