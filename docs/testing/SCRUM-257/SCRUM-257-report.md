# SCRUM-257: OWASP ZAP baseline scan of the deployed app

## What was run

The OWASP ZAP **baseline scan** (`zap-baseline.py`, image `ghcr.io/zaproxy/zaproxy:stable`) on 1 November 2026, by hand with Docker, against our own deployed apps only:

| Target | Command | Result |
|---|---|---|
| Frontend, `https://wassel-sooty.vercel.app` | `zap-baseline.py -t <url> -m 2` | 0 failures, 13 warnings, 55 passed |
| Backend, `https://wassel-production.up.railway.app` | `zap-baseline.py -t <url> -m 1` | 0 failures, 2 warnings, 66 passed |

The baseline scan is **passive**: it crawls the site for a minute or two and checks the responses it sees (headers, cookies, leaks). It sends no attack requests. The HTML reports are in `zap-reports/`.

The backend answers every unauthenticated request with a 401, so ZAP's crawler stopped at the front door ("spider error: 401 expected 200"). The backend scan therefore only covers that response. The real API surface is checked by `RoleAccessMatrixTests` (SCRUM-254) and by the frontend scan, since the frontend proxies `/api/*`.

After the fixes below, the same scan was run again against a production build of the new frontend on `localhost:3200` (report `zap-reports/3-after-fix-frontend-local.html`). It is a local run, so it shows the headers the app sets, not Vercel's own. Vercel adds `Strict-Transport-Security` itself, and that check passed in the first scan.

## Findings and what was done

### Fixed in this PR

| # | Finding (ZAP risk) | Cause | Fix |
|---|---|---|---|
| 1 | Content Security Policy header not set (Medium) | No CSP | `Content-Security-Policy` in `next.config.ts` (`headers()`), see "The policy" below |
| 2 | Missing anti-clickjacking header (Medium) | No framing rule | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` |
| 3 | `X-Content-Type-Options` header missing (Low) | Not set | `X-Content-Type-Options: nosniff` |
| 4 | Permissions Policy header not set (Low) | Not set | `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` |
| 5 | Cross-Origin-Opener-Policy and Cross-Origin-Resource-Policy missing (Low) | Not set | `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin` |
| 6 | Server leaks information via `X-Powered-By` (Low) | Next.js sends `X-Powered-By: Next.js` | `poweredByHeader: false` |
| 7 | Sensitive information in URL: an email, and a **password**, in the query string (Informational) | The four sign-in forms had no `method`, so they default to GET. The crawler submitted one and got `/login?email=…&password=…`. In the app the script stops that, but a person who submits before the page's script has loaded (or with it blocked) would put their password in the address bar, the browser history and the server logs | `method="post"` on the login, two-factor code, forgot-password and set-password forms. A submit without the script now fails visibly (a POST to a page that doesn't accept it) and puts nothing in the URL. Also added `Referrer-Policy: strict-origin-when-cross-origin` |

#### The policy

```
default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org;
font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
```

`connect-src 'self'` is enough because the app calls the API through its own `/api/*` proxy. In development, `'unsafe-eval'` is added to `script-src` (the dev server needs it); a production build never has it.

It was **checked in a browser** on a production build: the landing page and its images load, the sign-in form loads and its script runs, and a map loads all 15 tiles and its marker. The first attempt blocked every tile, because the tile host is `tile.openstreetmap.org` and `https://*.tile.openstreetmap.org` doesn't match the bare name; that is why both are listed.

### Accepted, with the reason

| Finding | Why it is accepted |
|---|---|
| CSP: `script-src 'unsafe-inline'` and `style-src 'unsafe-inline'` (Medium, after the fix) | The policy is much better than none (it still blocks other origins, plugins, framing and form hijacking), but `'unsafe-inline'` means an injected inline script would not be blocked. Next.js puts inline scripts in every page, and a nonce-based policy needs every page rendered per request (a middleware), which costs caching and is a bigger change than this ticket. The components also use inline `style` throughout, and the map library needs it. There is no known injection point: React escapes what it renders and there is no `dangerouslySetInnerHTML` in the app. Worth revisiting only if the app ever renders user-supplied HTML |
| Cross-Origin-Embedder-Policy header missing (Low) | COEP blocks cross-origin resources that don't opt in, and that includes the OpenStreetMap tiles. It protects against a class of attacks (Spectre-style) that matter for pages with sensitive in-memory data and `SharedArrayBuffer`, which this app doesn't use |
| Cross-Domain Misconfiguration: `Access-Control-Allow-Origin: *` (Medium) | Only on Vercel's static files and 404 pages (`/_next/static/…`, `robots.txt`, images). They are public by design and carry no cookies or data. The API, which does carry the session, answers CORS from the allow-list (`CORS_ALLOWED_ORIGINS`) and is reached through the same-origin proxy |
| Absence of anti-CSRF tokens (Medium, shows up after the forms became POST) | CSRF protection is the session cookie: `SameSite=Strict` plus the CORS allow-list (`backend/CLAUDE.md`, Security). A cross-site request never carries the cookie. The sign-in form itself has no session to hijack |
| Re-examine cache-control directives, Storable and cacheable content, Retrieved from cache, Non-storable content (Informational) | Vercel serves the public pages with `max-age=0, must-revalidate` and the hashed `/_next/static` files as cacheable, which is correct. The pages behind a sign-in show no data until the browser has called the API, and the API's answers aren't cacheable by a shared cache (they need the session cookie) |
| Authentication request identified, Modern web application (Informational) | Descriptions of the app, not weaknesses |
| Backend: Strict-Transport-Security header not set (Low) | Browsers never talk to the backend directly: they use the frontend, and Vercel sends HSTS. The backend sits behind Railway's HTTPS proxy and answers 401 to a stranger. Setting HSTS in Spring would only matter if the backend were reached directly in a browser |
| Backend: Non-storable content (Informational) | A 401 shouldn't be cached |

### Not fixed

Nothing that is a real problem was left unfixed, so **no bug tickets** were opened.

## How to run it again

The final demo is a good time to scan again. By hand, from the repository root:

```bash
docker run --rm -v "$(pwd):/zap/wrk:rw" ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://wassel-sooty.vercel.app -m 2 -r report.html
```

(The first run downloads a 3.7 GB image.) Only scan the apps we own. After this PR is merged and Vercel has redeployed, the Vercel result should lose findings 1 to 7 above; that check is done by running the command above again.

## Acceptance criteria

| Criterion | How it is met |
|---|---|
| The ZAP baseline scan runs against the deployed app, by hand or as a manual CI workflow | Run by hand against the Vercel frontend and the Railway backend; commands above |
| Every finding is listed with what was fixed or why it is accepted | The two tables above cover every alert in the three reports |
| Any real problem found gets its own bug ticket | None left unfixed: the one real problem (credentials in a URL, finding 7) was fixed in this PR |
