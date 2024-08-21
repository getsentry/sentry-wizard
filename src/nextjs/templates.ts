import chalk from 'chalk';
import { makeCodeSnippet } from '../utils/clack-utils';

type WithSentryConfigOptions = {
  orgSlug: string;
  projectSlug: string;
  selfHosted: boolean;
  sentryUrl: string;
  tunnelRoute: boolean;
  reactComponentAnnotation: boolean;
};

export function getWithSentryConfigOptionsTemplate({
  orgSlug,
  projectSlug,
  selfHosted,
  tunnelRoute,
  reactComponentAnnotation,
  sentryUrl,
}: WithSentryConfigOptions): string {
  return `{
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    org: "${orgSlug}",
    project: "${projectSlug}",${
    selfHosted ? `\n    sentryUrl: "${sentryUrl}",` : ''
  }

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,${
      reactComponentAnnotation
        ? `\n
    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
      enabled: true,
    },`
        : ''
    }

    // ${
      tunnelRoute ? 'Route' : 'Uncomment to route'
    } browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    ${tunnelRoute ? '' : '// '}tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  }`;
}

export function getNextjsConfigCjsTemplate(
  withSentryConfigOptionsTemplate: string,
): string {
  return `const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = withSentryConfig(
  nextConfig,
  ${withSentryConfigOptionsTemplate}
);
`;
}

export function getNextjsConfigCjsAppendix(
  withSentryConfigOptionsTemplate: string,
): string {
  return `

// Injected content via Sentry wizard below

const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  module.exports,
  ${withSentryConfigOptionsTemplate}
);
`;
}

export function getNextjsConfigEsmCopyPasteSnippet(
  withSentryConfigOptionsTemplate: string,
): string {
  return `

// next.config.mjs
import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(
  yourNextConfig,
  ${withSentryConfigOptionsTemplate}
);
`;
}

function getClientIntegrationsSnippet(features: { replay: boolean }) {
  if (features.replay) {
    return `

  // Add optional integrations for additional features
  integrations: [
    Sentry.replayIntegration(),
  ],`;
  }

  return '';
}

export function getSentryConfigContents(
  dsn: string,
  config: 'server' | 'client' | 'edge',
  selectedFeaturesMap: {
    replay: boolean;
    performance: boolean;
  },
): string {
  let primer;
  if (config === 'server') {
    primer = `// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/`;
  } else if (config === 'client') {
    primer = `// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/`;
  } else if (config === 'edge') {
    primer = `// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/`;
  }

  const integrationsOptions = getClientIntegrationsSnippet(selectedFeaturesMap);

  let replayOptions = '';
  if (config === 'client') {
    if (selectedFeaturesMap.replay) {
      replayOptions += `

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,`;
    }
  }

  let performanceOptions = '';
  if (selectedFeaturesMap.performance) {
    performanceOptions += `

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,`;
  }

  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `${primer}

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "${dsn}",${integrationsOptions}${performanceOptions}${replayOptions}

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
});
`;
}

export function getSentryExamplePageContents(options: {
  useClient: boolean;
}): string {
  return `${
    options.useClient ? '"use client";\n\n' : ''
  }import SentryPage from "./components/sentryPage";
  
  export default function Page() {
    const onButtonClick = async () => {
      // this will throw
      JSON.parse("Oh oh");
      const res = await fetch("/api/sentry-example-api");
      if (!res.ok) {
        throw new Error("Sentry Example Frontend Error");
      }
    };
    
    return <SentryPage onButtonClick={onButtonClick} />;
  }
  
  `;
}

export function getSentryComponentContents(options: {
  selfHosted: boolean;
  sentryUrl: string;
  orgSlug: string;
  projectId: string;
  useClient: boolean;
}): string {
  const issuesPageLink = options.selfHosted
    ? `${options.sentryUrl}organizations/${options.orgSlug}/issues/?project=${options.projectId}`
    : `https://${options.orgSlug}.sentry.io/issues/?project=${options.projectId}`;

  return `// @ts-nocheck
  ${
    options.useClient ? '"use client";\n\n' : ''
  }import { useRef, useState } from "react";
  import Link from "next/link";

export default function SentryPage({ onButtonClick }) {
  const canvasRef = useRef(null);
  const [link, setLink] = useState("");

  const handleClick = async (clickX, clickY) => {
    const canvas = canvasRef.current;

    if (canvas) {
      explode(canvas, clickX, clickY);
    }

    setLink("${issuesPageLink}");
    setTimeout(() => {
      canvasRef.current?.style.setProperty("z-index", "0");
    }, 2000);

    onButtonClick();
  };

  return (
    <>
      <style jsx>
        {\`
          @keyframes bounce {
            0%,
            100% {
              transform: translateY(-10%);
              animation-timing-function: cubic-bezier(0.8, 0, 1, 1);
            }
            50% {
              transform: translateY(0);
              animation-timing-function: cubic-bezier(0, 0, 0.2, 1);
            }
          }

          @keyframes fadeInLoad {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
        \`}
      </style>

      <style jsx>
        {\`
          @import url("https://fonts.googleapis.com/css2?family=Rubik:ital,wght@0,300..900;1,300..900&display=swap");
        \`}
      </style>

      <canvas ref={canvasRef} style={{ position: "fixed", zIndex: 10 }} />
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundImage:
            "linear-gradient(180deg, #362D59 0%, #563275 50.08%, #8D5494 100%)",
          fontFamily: '"Rubik", sans-serif',
        }}
      >
        <h1 style={{ fontSize: "2rem", margin: "14px 0" }}>
          <svg
            style={{
              height: "1em",
            }}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 200 44"
          >
            <path
              fill="white"
              d="M124.32,28.28,109.56,9.22h-3.68V34.77h3.73V15.19l15.18,19.58h3.26V9.22h-3.73ZM87.15,23.54h13.23V20.22H87.14V12.53h14.93V9.21H83.34V34.77h18.92V31.45H87.14ZM71.59,20.3h0C66.44,19.06,65,18.08,65,15.7c0-2.14,1.89-3.59,4.71-3.59a12.06,12.06,0,0,1,7.07,2.55l2-2.83a14.1,14.1,0,0,0-9-3c-5.06,0-8.59,3-8.59,7.27,0,4.6,3,6.19,8.46,7.52C74.51,24.74,76,25.78,76,28.11s-2,3.77-5.09,3.77a12.34,12.34,0,0,1-8.3-3.26l-2.25,2.69a15.94,15.94,0,0,0,10.42,3.85c5.48,0,9-2.95,9-7.51C79.75,23.79,77.47,21.72,71.59,20.3ZM195.7,9.22l-7.69,12-7.64-12h-4.46L186,24.67V34.78h3.84V24.55L200,9.22Zm-64.63,3.46h8.37v22.1h3.84V12.68h8.37V9.22H131.08ZM169.41,24.8c3.86-1.07,6-3.77,6-7.63,0-4.91-3.59-8-9.38-8H154.67V34.76h3.8V25.58h6.45l6.48,9.2h4.44l-7-9.82Zm-10.95-2.5V12.6h7.17c3.74,0,5.88,1.77,5.88,4.84s-2.29,4.86-5.84,4.86Z M29,2.26a4.67,4.67,0,0,0-8,0L14.42,13.53A32.21,32.21,0,0,1,32.17,40.19H27.55A27.68,27.68,0,0,0,12.09,17.47L6,28a15.92,15.92,0,0,1,9.23,12.17H4.62A.76.76,0,0,1,4,39.06l2.94-5a10.74,10.74,0,0,0-3.36-1.9l-2.91,5a4.54,4.54,0,0,0,1.69,6.24A4.66,4.66,0,0,0,4.62,44H19.15a19.4,19.4,0,0,0-8-17.31l2.31-4A23.87,23.87,0,0,1,23.76,44H36.07a35.88,35.88,0,0,0-16.41-31.8l4.67-8a.77.77,0,0,1,1.05-.27c.53.29,20.29,34.77,20.66,35.17a.76.76,0,0,1-.68,1.13H40.6q.09,1.91,0,3.81h4.78A4.59,4.59,0,0,0,50,39.43a4.49,4.49,0,0,0-.62-2.28Z"
            ></path>
          </svg>
        </h1>
        <div
          style={{
            height: "auto",
            width: "100px",
          }}
        >
          <PeekingGremlin />
        </div>
        <div
          style={{
            background:
              "linear-gradient(45deg, #6A5FC1 0%, #FF5980 48.96%, #F1B71C 100%)",
            borderRadius: "8px",
            padding: "7px",
            boxShadow:
              "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
            minWidth: "30vw",
            zIndex: 2,
          }}
        >
          <div
            style={{
              borderRadius: "6px",
              background: "#fff",
              padding: "30px",
            }}
          >
            <p
              style={{
                fontSize: "1.8rem",
                fontWeight: "bold",
                paddingBottom: "20px",
              }}
            >
              Test your Sentry SDK Setup
            </p>
            {link ? (
              <div
                style={{
                  fontSize: "1.3rem",
                  animation: "fadeInLoad 6s",
                }}
              >
                Good job, now head over to{" "}
                <Link style={{ textDecoration: "underline" }} href={link}>
                  {link}
                </Link>
              </div>
            ) : (
              <>
                <p
                  style={{
                    fontSize: "1.3rem",
                    paddingBottom: "10px",
                  }}
                >
                  First, simulate throwing an error:
                </p>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    style={{
                      padding: "26px",
                      cursor: "pointer",
                      backgroundColor: "#8D5494",
                      border: "none",
                      borderRadius: "8px",
                      boxShadow:
                        "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                      color: "white",
                      fontSize: "20px",
                      fontWeight: "bold",
                      margin: "30px",
                      animation: "bounce 1s infinite",
                    }}
                    onClick={async (e) => {
                      handleClick(e.clientX, e.clientY);
                    }}
                  >
                    ⚡️ THROW ERROR ⚡️
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

// @ts-nocheck

const PeekingGremlin = () => {
  return (
    <GremlinWrapper>
      <Hands>
        <svg
          viewBox="0 0 119 17"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g id="right">
            <path
              d="M97.77 6.31001C97.77 6.31001 100.88 2.45002 103.52 2.13002C107.27 1.67002 115.03 1.43 116.42 2.83C117.47 3.88 118.86 8.76002 117.99 10.85C117.12 12.94 114.5 15.38 114.5 15.38L103.63 15.67C103.63 15.67 104.16 13.15 104.26 11.05C104.36 8.95 103.34 6.67003 103.34 6.67003L97.76 6.32002L97.77 6.31001Z"
              fill="#F1B71C"
              stroke="#452650"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M112.02 15.26C112.02 15.26 113.78 12.4 114.11 10.75C114.44 9.1 113.56 5.79999 113.56 5.79999"
              stroke="#452650"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M107.4 15.26C107.4 15.26 109.05 12.18 109.27 10.75C109.49 9.32 108.83 6.23999 108.83 6.23999"
              stroke="#452650"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <g id="left">
            <path
              d="M22.67 7.78998C22.67 7.78998 22.33 6.06997 21.29 5.20997C20.25 4.34997 18.02 3.82996 18.02 3.82996C18.02 3.82996 17.3301 1.76997 15.7801 1.24997C14.2301 0.729975 2.20004 2.96996 1.51004 3.48996C0.820037 4.00996 0.650034 4.86998 0.820034 6.40998C0.990034 7.94998 5.29001 16.38 5.29001 16.38L17.95 15.6L18.87 7.60996L22.6501 7.77997L22.67 7.78998Z"
              fill="#F1B71C"
              stroke="#452650"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14.18 15.89C14.18 15.89 13.41 9.50996 13.41 6.42996"
              stroke="#452650"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M9.66999 15.89C9.66999 15.89 8.06001 12.9 7.69001 10.94C7.25001 8.62997 7.36 7.08997 7.36 7.08997"
              stroke="#452650"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </svg>
      </Hands>
      <Gremlin>
        <svg
          viewBox="0 0 116 107"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M70.97 74.56C71.13 75.21 72.6 103.35 72.6 103.35L62.35 103.68L65.28 73.42L70.97 74.56Z"
            fill="#F1B71C"
            stroke="#452650"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M46.73 66.59C46.89 67.47 48.36 105.52 48.36 105.52L38.11 105.96L41.04 65.13L46.73 66.59Z"
            fill="#F1B71C"
            stroke="#452650"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M75.78 36.14C76.64 36.57 110.77 80.04 113.14 83.17C116.3 87.36 114.93 91.06 111.71 93.75C108.49 96.44 103.72 95.22 100.32 88.69C98.3 84.82 71.82 37.11 71.82 37.11L75.79 36.13L75.78 36.14Z"
            fill="#F1B71C"
          />
          <path
            d="M75.78 36.14C76.64 36.57 110.77 80.04 113.14 83.17C116.3 87.36 114.93 91.06 111.71 93.75C108.49 96.44 103.72 95.22 100.32 88.69C98.3 84.82 71.82 37.11 71.82 37.11"
            stroke="#452650"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M18.18 66.43L86.63 79.81C89.38 80.35 92.04 78.8 91.2 74.66C90.57 71.56 71.94 4.40999 71.94 4.40999C71.03 0.0399899 67.2 -0.700011 64.67 2.93999C64.67 2.93999 17.5 56.5 15.25 59.31C12.62 62.6 15.43 65.88 18.18 66.42V66.43Z"
            fill="#F1B71C"
            stroke="#452650"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M58.2 61.43L59.84 56.33L54.46 55.05L53.74 60.76L58.2 61.43Z"
            fill="#452650"
          />
          <path
            d="M60.51 49.78L55.89 49.11L58.79 23.76L67.12 25.23L60.51 49.78Z"
            fill="#452650"
          />
          <path
            d="M38.35 42.87C38.38 43.83 16.22 94.46 14.57 98.02C12.37 102.78 8.46003 103.32 4.58003 101.77C0.700035 100.22 -0.499958 95.43 3.65004 89.34C6.10004 85.73 35.62 39.84 35.62 39.84L38.35 42.87Z"
            fill="#F1B71C"
          />
          <path
            d="M38.35 42.87C38.38 43.83 16.22 94.46 14.57 98.02C12.37 102.78 8.46003 103.32 4.58003 101.77C0.700035 100.22 -0.499958 95.43 3.65004 89.34C6.10004 85.73 35.62 39.84 35.62 39.84"
            stroke="#452650"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Gremlin>
    </GremlinWrapper>
  );
};

const GremlinWrapper = ({ children }) => (
  <div
    style={{
      position: "relative",
      width: "100%",
      minHeight: "5.3125rem",
    }}
  >
    {children}
  </div>
);

const Gremlin = ({ children }) => (
  <div
    style={{
      position: "absolute",
      top: "10%",
      left: 0,
      right: 0,
      zIndex: 0,
      opacity: 1,
    }}
  >
    {children}
  </div>
);

const Hands = ({ children }) => (
  <div
    style={{
      position: "absolute",
      top: "90%",
      left: "0%",
      right: "-5%",
      zIndex: 3,
    }}
  >
    {children}
  </div>
);

export const explode = (canvas, initialX, initialY) => {
  const ctx = canvas.getContext("2d");
  if (ctx) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const config = {
      particleNumber: 1000,
      maxParticleSize: 14,
      maxSpeed: 50,
      colorVariation: 50,
    };

    const colorPalette = {
      matter: [
        { r: 241, g: 183, b: 28 },
        { r: 106, g: 95, b: 193 },
        { r: 255, g: 89, b: 128 },
        { r: 241, g: 183, b: 28 },
      ],
    };

    let particles = [];

    const clear = function (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };

    const createParticle = function (newX, newY) {
      return {
        x: newX || Math.round(Math.random() * canvas.width),
        y: newY || Math.round(Math.random() * canvas.height),
        r: Math.ceil(Math.random() * config.maxParticleSize),
        c: colorVariation(
          colorPalette.matter[
            Math.floor(Math.random() * colorPalette.matter.length)
          ],
          true
        ),
        s: Math.pow(Math.ceil(Math.random() * config.maxSpeed), 0.7),
        d: Math.round(Math.random() * 360),
      };
    };

    const colorVariation = function (color, returnString) {
      var r, g, b, a, variation;
      r = Math.round(
        Math.random() * config.colorVariation -
          config.colorVariation / 2 +
          color.r
      );
      g = Math.round(
        Math.random() * config.colorVariation -
          config.colorVariation / 2 +
          color.g
      );
      b = Math.round(
        Math.random() * config.colorVariation -
          config.colorVariation / 2 +
          color.b
      );
      a = Math.random() + 0.5;
      if (returnString) {
        return "rgba(" + r + "," + g + "," + b + "," + a + ")";
      } else {
        return { r, g, b, a };
      }
    };

    const updateParticleModel = function (p) {
      var a = 180 - (p.d + 90);
      p.d > 0 && p.d < 180
        ? (p.x += (p.s * Math.sin(p.d)) / Math.sin(p.s))
        : (p.x -= (p.s * Math.sin(p.d)) / Math.sin(p.s));
      p.d > 90 && p.d < 270
        ? (p.y += (p.s * Math.sin(a)) / Math.sin(p.s))
        : (p.y -= (p.s * Math.sin(a)) / Math.sin(p.s));
      return p;
    };

    const drawParticle = function (x, y, r, c) {
      ctx.beginPath();
      ctx.fillStyle = c;
      ctx.arc(x, y, r, 0, 2 * Math.PI, false);
      ctx.fill();
      ctx.closePath();
    };

    const cleanUpArray = function () {
      particles = particles.filter((p) => {
        return p.x > -100 && p.y > -100;
      });
    };

    const initParticles = function (numParticles, x, y) {
      for (let i = 0; i < numParticles; i++) {
        particles.push(createParticle(x, y));
      }
      particles.forEach((p) => {
        drawParticle(p.x, p.y, p.r, p.c);
      });
    };

    const frame = function () {
      clear(ctx);
      particles.map((p) => {
        return updateParticleModel(p);
      });
      particles.forEach((p) => {
        drawParticle(p.x, p.y, p.r, p.c);
      });

      window.requestAnimationFrame(frame);
    };

    frame();

    let nextX = initialX;
    let nextY = initialY;

    initParticles(config.particleNumber, nextX, nextY);
    cleanUpArray();
    setTimeout(() => {
      nextX += Math.floor(Math.random() * 101) - 50;
      nextY += Math.floor(Math.random() * 101) - 50;
      initParticles(config.particleNumber, nextX, nextY);
      cleanUpArray();
    }, 500);
  }
};

    `;
}

export function getSentryExamplePagesDirApiRoute() {
  return `// A faulty API route to test Sentry's error monitoring
export default function handler(_req, res) {
  throw new Error("Sentry Example API Route Error");
  res.status(200).json({ name: "John Doe" });
}
`;
}

export function getSentryExampleAppDirApiRoute() {
  return `import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// A faulty API route to test Sentry's error monitoring
export function GET() {
  throw new Error("Sentry Example API Route Error");
  return NextResponse.json({ data: "Testing Sentry Error..." });
}
`;
}

export function getSentryDefaultUnderscoreErrorPage() {
  return `import * as Sentry from "@sentry/nextjs";
import Error from "next/error";

const CustomErrorComponent = (props) => {
  return <Error statusCode={props.statusCode} />;
};

CustomErrorComponent.getInitialProps = async (contextData) => {
  // In case this is running in a serverless function, await this in order to give Sentry
  // time to send the error before the lambda exits
  await Sentry.captureUnderscoreErrorException(contextData);

  // This will contain the status code of the response
  return Error.getInitialProps(contextData);
};

export default CustomErrorComponent;
`;
}

export function getSimpleUnderscoreErrorCopyPasteSnippet() {
  return `
${chalk.green(`import * as Sentry from '@sentry/nextjs';`)}
${chalk.green(`import Error from "next/error";`)}

${chalk.dim(
  '// Replace "YourCustomErrorComponent" with your custom error component!',
)}
YourCustomErrorComponent.getInitialProps = async (${chalk.green(
    'contextData',
  )}) => {
  ${chalk.green('await Sentry.captureUnderscoreErrorException(contextData);')}

  ${chalk.dim('// ...other getInitialProps code')}

  return Error.getInitialProps(contextData);
};
`;
}

export function getFullUnderscoreErrorCopyPasteSnippet(isTs: boolean) {
  return `
import * as Sentry from '@sentry/nextjs';${
    isTs ? '\nimport type { NextPageContext } from "next";' : ''
  }
import Error from "next/error";

${chalk.dim(
  '// Replace "YourCustomErrorComponent" with your custom error component!',
)}
YourCustomErrorComponent.getInitialProps = async (contextData${
    isTs ? ': NextPageContext' : ''
  }) => {
  await Sentry.captureUnderscoreErrorException(contextData);

  return Error.getInitialProps(contextData);
};
`;
}

export function getInstrumentationHookContent(
  instrumentationHookLocation: 'src' | 'root',
) {
  return `export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/sentry.edge.config');
  }
}
`;
}

export function getInstrumentationHookCopyPasteSnippet(
  instrumentationHookLocation: 'src' | 'root',
) {
  return makeCodeSnippet(true, (unchanged, plus) => {
    return unchanged(`export ${plus('async')} function register() {
  ${plus(`if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('${
      instrumentationHookLocation === 'root' ? '.' : '..'
    }/sentry.edge.config');
  }`)}
}`);
  });
}

export function getSentryDefaultGlobalErrorPage(isTs: boolean) {
  return isTs
    ? `"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* \`NextError\` is the default Next.js error page component. Its type
        definition requires a \`statusCode\` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}`
    : `"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        {/* \`NextError\` is the default Next.js error page component. Its type
        definition requires a \`statusCode\` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
`;
}

export function getGlobalErrorCopyPasteSnippet(isTs: boolean) {
  if (isTs) {
    return `"use client";

${chalk.green('import * as Sentry from "@sentry/nextjs";')}
${chalk.green('import Error from "next/error";')}
${chalk.green('import { useEffect } from "react";')}

export default function GlobalError(${chalk.green(
      '{ error }: { error: Error }',
    )}) {
  ${chalk.green(`useEffect(() => {
    Sentry.captureException(error);
  }, [error]);`)}

  return (
    <html>
      <body>
        {/* Your Error component here... */}
      </body>
    </html>
  );
}
`;
  } else {
    return `"use client";

${chalk.green('import * as Sentry from "@sentry/nextjs";')}
${chalk.green('import Error from "next/error";')}
${chalk.green('import { useEffect } from "react";')}

export default function GlobalError(${chalk.green('{ error }')}) {
  ${chalk.green(`useEffect(() => {
    Sentry.captureException(error);
  }, [error]);`)}

  return (
    <html>
      <body>
        {/* Your Error component here... */}
      </body>
    </html>
  );
}
`;
  }
}
