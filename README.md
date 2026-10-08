<div align="center">

# 📡 ServerPulse

**Test latency and bandwidth to the server currently hosting the website**

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![SQLite](https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

*A lightweight browser-based network tester that measures the connection from your device to the ServerPulse host, with a public results leaderboard.*

</div>

---

## ✨ Features

- 📶 **Latency testing** — 40 requests with individual results, median, average, minimum, maximum, jitter, packet loss, and a quality rating.
- 🚀 **Bandwidth testing** — 2 MB download and upload speed tests.
- 🏆 **Public Results** — choose a username and view the latest submitted latency and bandwidth results.
- 👤 **Anonymous participant ID** — a generated client ID identifies your results without requiring an account or password.
- ⏱️ **Rate limiting** — latency and bandwidth submissions are independently limited to once every 20 seconds.
- ✏️ **Username editing** — usernames can be changed once per hour.
- 💾 **Persistent results** — leaderboard data is stored in SQLite on the hosting server.
- 📍 **Server location** — displays the approximate location of the server hosting ServerPulse.
- 🔒 **Privacy-friendly** — no accounts, analytics, advertising, or stored user IP addresses.
- 📱 **Responsive UI** — designed to work on desktop and mobile browsers.
- 🌙 **Dark-first design** — clean interface for comfortable use across devices.

---

## 🚀 Quick Start

### 1. Clone the repository

Clone the repository to your local machine or hosting server.

```bash
git clone https://github.com/MinecadeXD/ServerPulse.git
cd ServerPulse
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the port

Create a `.env` file if your hosting environment requires a specific port:

```env
PORT=3000
```

If `PORT` is not provided, ServerPulse uses port `3000`.

### 4. Start ServerPulse

```bash
npm start
```

Then open the server address in your browser.

For local development:

```text
http://localhost:3000
```

---

## ⚙️ Configuration

ServerPulse intentionally keeps configuration small.

### `PORT`

Controls the HTTP port used by the Node.js server.

```env
PORT=3000
```

The value is normally supplied by your hosting provider. If it is not set, the application defaults to `3000`.

### `.env.example`

The repository includes a template for local configuration:

```env
PORT=3000
```

Copy it to `.env` and adjust the value when needed.

> **Important:** Never commit your real `.env` file. It is ignored by Git.

---

## 📊 How It Works

ServerPulse measures the connection between the visitor's browser and the HTTP server currently hosting ServerPulse.

### Latency

The latency test performs **40 requests** to the ServerPulse server and records each response time.

It then calculates:

- Median latency
- Average latency
- Minimum latency
- Maximum latency
- Jitter
- Packet loss
- Overall quality rating

The final latency result submitted to the Results leaderboard is the test's **median latency**.

### Bandwidth

The bandwidth test measures:

- Download speed
- Upload speed

Both tests use a fixed **2 MB** payload. The measured values are submitted independently to the Results leaderboard.

### Results

Participants choose a username and receive a locally generated client ID.

The server stores:

- Username
- Anonymous client ID
- Latest latency result
- Latest download speed
- Latest upload speed
- Test timestamps

The leaderboard keeps the **latest submitted result**, rather than a user's best historical result.

---

## 🏆 Results & Rate Limits

The Results system is designed to remain simple and lightweight.

- Users can register with only a username.
- Users who have not tested yet can still appear as **Not tested**.
- Latency and bandwidth results are stored independently.
- Latency submissions are limited to once every **20 seconds**.
- Bandwidth submissions are limited to once every **20 seconds**.
- Username changes are limited to once every **60 minutes**.
- The public leaderboard displays up to **100 participants**.
- Results are loaded when the Results tab is opened.
- No account, password, email address, or public IP address is required.

The database is created automatically at:

```text
data/serverpulse.db
```

SQLite database files are intentionally ignored by Git.

---

## 🗂️ Repository Structure

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

The SQLite database is generated automatically in the `data/` directory when the server starts. It is not part of the repository.

---

## 🌐 Server Location

ServerPulse performs a lightweight IP geolocation lookup at server startup to determine the approximate location of the hosting server.

The detected location is cached in memory and displayed by the website.

ServerPulse currently uses **ipwho.is** for this lookup.

No visitor IP address is stored in the ServerPulse database.

---

## 🚀 Deployment

ServerPulse can run on any Node.js-compatible hosting service that supports:

- Node.js 18 or newer
- `npm install`
- `npm start`
- A writable filesystem for SQLite
- The hosting provider's `PORT` environment variable

### Important for production hosting

The `data/` directory must be persistent if you want the public Results leaderboard to survive server restarts, redeployments, or application replacements.

If the hosting provider deletes the SQLite database, the saved Results data will also be lost.

---

## 🔒 Security & Privacy

ServerPulse is intentionally designed without user accounts or unnecessary tracking.

- No passwords are collected.
- No email addresses are collected.
- No analytics are included.
- No advertising is included.
- Visitor IP addresses are not stored in the Results database.
- Client IDs are generated locally and are not authentication credentials.
- Usernames are validated on both the client and server.
- Result submissions are rate-limited server-side.
- Database files are excluded from Git.
- Environment files are excluded from Git.

> **Important:** A ServerPulse client ID is only an anonymous participant identifier. It must not be treated as a secure authentication token.

---

## ⚠️ Important Limitations

ServerPulse measures the connection **from the visitor's browser to the server hosting ServerPulse**.

It does not:

- Test every region or data center.
- Measure the connection between two arbitrary servers.
- Provide continuous uptime monitoring.
- Store historical performance graphs.
- Guarantee ISP-wide or nationwide internet speed measurements.
- Replace dedicated network diagnostic tools.

Results can vary depending on the visitor's device, browser, Wi-Fi/mobile connection, ISP, network congestion, and server load.

---

## 🧪 Troubleshooting

### The website does not load

Check that:

- The Node.js server is running.
- The hosting provider has started the application with `npm start`.
- The configured `PORT` matches the port expected by the hosting provider.
- The server is reachable from your device.

### The tests appear stuck

Check:

- The browser console for JavaScript errors.
- That the browser can reach the ServerPulse server.
- That the hosting provider is not blocking the required requests.
- That the Node.js process is still running.

### Results are not being saved

Check:

- The server has a writable `data/` directory.
- SQLite dependencies installed successfully.
- The Node.js process has not restarted with a fresh or temporary filesystem.
- The server logs for database or API errors.

### The Results leaderboard disappeared

The Results database is stored on the hosting server.

If the hosting provider resets or replaces the application's persistent storage, `data/serverpulse.db` may be lost. Use persistent storage if your host provides it.

---

## 🤝 Contributing

Contributions are welcome.

Before opening a pull request:

1. Keep the project focused on latency, bandwidth, and public result testing.
2. Avoid adding unnecessary external services or tracking.
3. Keep the project lightweight and maintainable.
4. Update the README when user-facing behavior changes.
5. Do not commit `.env` files, database files, credentials, or generated build output.
6. Test both the frontend and Node.js server when changing application logic.

---

## ⭐ Support the Project

If ServerPulse is useful to you:

- ⭐ Star the repository.
- 🐛 Report reproducible bugs through GitHub Issues.
- 💡 Suggest improvements through GitHub Issues.
- 🔧 Submit pull requests for useful, tested improvements.

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for the full license text.

---

<div align="center">

### Made with ♥️ by [Minecade](https://github.com/MinecadeXD)

</div>
