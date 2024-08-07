import {
  useLocation,
  useMatches,
} from "@remix-run/react";

import {  useEffect,} from "react";
import * as Sentry from "@sentry/remix";
Sentry.init(undefined)