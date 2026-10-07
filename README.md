# ServerPulse

A clean, lightweight Node.js website for testing the connection between your device and the server currently hosting ServerPulse.

## Tests

- **Latency:** 20 individual requests with average, minimum, maximum, jitter, and packet loss.
- **Bandwidth:** 10 MB download and upload speed tests.

## Run locally

```bash
npm start
```

Then open `http://localhost:3000`.

## Stack

- Node.js
- Vanilla HTML, CSS, and JavaScript
- No database
- No external APIs
- No tracking

## Note

Latency is measured from the browser to the HTTP server endpoint. If the deployment uses a CDN or reverse proxy, the measured endpoint may be an edge server rather than the origin server.


## Environment configuration

Set the port manually with a `.env` file:

```env
PORT=3000
```

Start the server with:

```bash
npm start
```

The server reads `PORT` from the environment. If it is not set, it falls back to port `3000`.

For deployment, set the `PORT` environment variable provided by your hosting service to the port you want ServerPulse to listen on.
