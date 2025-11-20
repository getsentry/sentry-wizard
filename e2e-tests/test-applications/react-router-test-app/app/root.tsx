import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <div className="App">
          <nav>
            <ul>
              <li>
                <a href="/">Home</a>
              </li>
              <li>
                <a href="/about">About</a>
              </li>
              <li>
                <a href="/contact">Contact</a>
              </li>
            </ul>
          </nav>

          <main>
            <Outlet />
          </main>
        </div>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
