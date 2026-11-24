// A slow stand-in for Brevo's HTTPS API (SCRUM-293). BrevoMailer posts to /v3/smtp/email; this answers 201 after
// MAIL_DELAY_MS and remembers the six-digit sign-in code per recipient, so the load test can finish the two-step
// sign-in by asking GET /code?email=... No email leaves the machine.
import http from "node:http";

const DELAY = Number(process.env.MAIL_DELAY_MS ?? 800);
const codes = new Map();
let sent = 0;

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://stub");
    if (req.method === "POST" && url.pathname === "/v3/smtp/email") {
      let raw = "";
      req.on("data", (chunk) => (raw += chunk));
      req.on("end", () => {
        try {
          const message = JSON.parse(raw);
          const to = message.to?.[0]?.email;
          const code = /\b(\d{6})\b/.exec(message.textContent ?? "")?.[1];
          if (to && code) codes.set(to, code);
          sent += 1;
        } catch {
          // A body that is not JSON is answered like Brevo would: 400.
          res.writeHead(400).end();
          return;
        }
        setTimeout(() => {
          res.writeHead(201, { "content-type": "application/json" });
          res.end('{"messageId":"stub"}');
        }, DELAY);
      });
    } else if (req.method === "GET" && url.pathname === "/code") {
      const code = codes.get(url.searchParams.get("email") ?? "");
      res.writeHead(code ? 200 : 404, { "content-type": "application/json" });
      res.end(JSON.stringify({ code: code ?? null }));
    } else if (req.method === "GET" && url.pathname === "/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ sent, delayMs: DELAY }));
    } else {
      res.writeHead(404).end();
    }
  })
  .listen(9000, () => console.log(`mail stand-in on :9000, answering after ${DELAY} ms`));
