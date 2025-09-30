import { Outlet } from 'react-router';

export default function RootLayout() {
  return (
    <html>
      <head>
        <title>React Router App</title>
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  );
}
