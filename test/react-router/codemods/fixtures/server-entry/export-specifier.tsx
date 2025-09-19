import * as Sentry from '@sentry/react-router';
import type { AppLoadContext, EntryContext } from 'react-router';
import { ServerRouter } from 'react-router';
import { renderToString } from 'react-dom/server';

// Function declared normally, then exported via export specifier (the pattern that was buggy)
async function handleError(
  error: unknown,
  { request }: { request: Request }
): Promise<Response> {
  if (!request.signal.aborted) {
    // This file already has Sentry error capture, testing that our codemod detects this
    // and doesn't duplicate it when using export specifier pattern
    Sentry.captureException(error);
  }
  console.error(error);
  return new Response('Internal Server Error', { status: 500 });
}

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext
) {
  const html = renderToString(
    <ServerRouter context={routerContext} url={request.url} />
  );

  responseHeaders.set('Content-Type', 'text/html');

  return new Response(`<!DOCTYPE html>${html}`, {
    status: responseStatusCode,
    headers: responseHeaders,
  });
}

// This export pattern was not detected by the original codemod
export { handleError };
