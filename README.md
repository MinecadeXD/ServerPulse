# ServerPulse

A clean, lightweight Node.js website for testing the connection between your device and the server currently hosting ServerPulse.

## Features

- **Latency testing** — 40 individual requests with median, average, minimum, maximum, jitter, packet loss, and a quality rating.
- **Bandwidth testing** — 2 MB download and upload speed tests.
- **Public Results** — participants can choose a username and view a leaderboard of the latest submitted results.
- **Persistent results** — results are stored locally in SQLite on the server hosting ServerPulse.
- **Server location** — displays the detected hosting-server location using a lightweight IP geolocation lookup.
- **Privacy-friendly** — no accounts, passwords, analytics, advertising, or public IP-address storage.
- **Responsive dark UI** — works on desktop and mobile browsers.

## How it works

ServerPulse measures the connection from your browser to the HTTP server currently hosting the website.

Latency requests are sent directly to the ServerPulse server. Bandwidth tests download and upload a small fixed payload to measure throughput.

The Results leaderboard stores a generated client ID, username, and the latest latency/bandwidth results. Latency and bandwidth submissions are independently rate-limited to prevent excessive requests.

## Project structure

```text
ServerPulse/
├── public/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── server.js
├── package.json
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

The SQLite database is created automatically in `data/serverpulse.db` when the server starts. The database files are ignored by Git and should remain on the hosting server rather than being committed to the repository.

## Requirements

- Node.js 18 or newer
- npm

## Run locally

Install the dependencies:

```bash
npm install
```

Start ServerPulse:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

## Environment configuration

ServerPulse supports a `.env` file for the listening port:

```env
PORT=3000
```

If `PORT` is not set, ServerPulse uses port `3000`.

For deployment, set the `PORT` environment variable required by your hosting provider.

## Deployment notes

ServerPulse is designed to run as a small Node.js server and can be deployed on a Node.js-compatible host.

Make sure the deployment:

1. Uses Node.js 18 or newer.
2. Runs `npm install` before starting the application.
3. Starts the application with `npm start`.
4. Provides a writable persistent directory for the SQLite database.
5. Passes the hosting provider's assigned port through the `PORT` environment variable.

Because the Results database is stored on the server filesystem, deleting or replacing the hosting storage will also remove the saved leaderboard data.

## External service

ServerPulse uses `https://ipwho.is/` at server startup to detect the approximate location of the hosting server. The location is cached in memory and exposed to the frontend as server-location information.

No user IP address is stored in the ServerPulse database.

## License

ServerPulse is released under the MIT License. See [LICENSE](LICENSE).
