# Browser tests

Real Chrome, real mouse input, against a running tracker.

1. Start the app in one terminal: `node node_modules/next/dist/bin/next dev` (from the project root).
   If styles ever look out of date, stop it and start it again before testing.
2. In another terminal: `cd e2e` then `npm install` (first time only), then `npm test`.

`TRACKER_URL` (default `http://localhost:3000`) and `CHROME_PATH` (default the usual Windows Chrome)
can be set to point elsewhere. The rules behind the palace maps have their own fast tests:
run `npm test` from the project root.

These tests live in their own folder with their own `package.json` so the app's lockfile and the
Vercel build are not touched. Popouts and multi-monitor placement cannot be automated and stay manual.
