# PDFDock at Forestry Commission head office

One server, one HTTPS address, three Docker containers:

| Container | What it does | Reachable from |
|---|---|---|
| `web` (nginx) | Serves the app, HTTPS, security headers, routes `/api/*` | Staff browsers (ports 80/443) |
| `auth` | Staff sign-in with an emailed code; SQLite on a Docker volume | Only through `web` |
| `pdf2word` | PDF to Word conversion; files held in memory only | Only through `web`, and only for head-office addresses |

Every tool except PDF to Word runs inside the staff member's browser. The
server delivers the app and handles sign-in; it never receives documents,
except the one being converted by PDF to Word, which is deleted as soon as
the Word file is returned.

## What you need

- A Linux or Windows server at head office with Docker (Docker Engine +
  Compose v2, or Docker Desktop). 2 CPU cores and 4 GB RAM is enough to start;
  PDF to Word is the only part that uses real CPU.
- A hostname staff will use, e.g. `pdfdock.fc.gov.gh`, pointing at the
  server in FC's DNS.
- A TLS certificate for that hostname. HTTPS is required: offline use, the
  phone camera (Scan document) and secure sign-in cookies all depend on it.
  Options: a certificate from FC's usual provider, Let's Encrypt (if the name
  is publicly resolvable), or FC's internal certificate authority (then every
  staff device must trust that CA).
- An SMTP account that can send from an `@fc.gov.gh` address, for the
  sign-in codes. Ask MIS which mail system FC uses (Microsoft 365, Google
  Workspace or an internal relay). See `.env.example` for settings.
- The head-office network ranges (ask MIS), for PDF to Word.

## First install

```bash
cd deploy/headoffice
cp .env.example .env           # then fill it in; generate secrets with: openssl rand -hex 32
cp /path/to/fullchain.pem certs/fullchain.pem
cp /path/to/privkey.pem   certs/privkey.pem
# edit headoffice-networks.conf so it lists only the head-office ranges
docker compose up -d --build
docker compose ps              # all three should show "healthy"
```

Open `https://<PUBLIC_HOSTNAME>` and sign in with your own
`firstname.lastname@fc.gov.gh` address to check the email arrives.

## How staff sign in

There is one screen and nothing to fill in but an email address:

1. Staff enter their official address (`firstname.lastname@fc.gov.gh`).
2. PDFDock emails a 6-digit code (valid 10 minutes). The email also has a link
   that fills the code in; they still press **Confirm**. This is deliberate:
   mail security scanners open links in emails automatically, which would use
   up a one-time link before the person clicks it.
3. That's it. The first confirmed code sets up access; later sign-ins are the
   same two steps. A sign-in lasts 30 days, and an installed app keeps working
   offline with the last sign-in.

### What is stored

Only each address that has signed in, when it first did, and whether IT has
blocked it (plus short-lived codes and sessions, stored as hashes). No names,
no staff IDs, no divisions, no record of sign-ins, tools used or files. The
app exists so staff don't put sensitive documents into free online PDF
sites; it doesn't monitor staff.

Addresses that aren't `@fc.gov.gh`, don't follow the `firstname.lastname`
pattern, or belong to shared mailboxes (`info.`, `hr.`, `registry.` ...) are
refused.

### Limiting to a list of addresses (optional)

By default any correctly formatted `@fc.gov.gh` address can sign in. Having
the mailbox already proves someone is staff, and closing it when they leave
stops new sign-ins. If MIS wants a fixed list instead, put the addresses (one
per line) in `deploy/headoffice/staff/staff.txt`, set
`STAFF_ALLOWLIST_FILE=/app/staff/staff.txt` in `.env`, and run
`docker compose up -d`. Updates to the file apply without a restart.

## Everyday administration

```bash
docker compose exec auth node src/admin.js count                               # how many addresses have signed in
docker compose exec auth node src/admin.js block   name.surname@fc.gov.gh      # also signs them out everywhere
docker compose exec auth node src/admin.js unblock name.surname@fc.gov.gh
docker compose logs -f auth                                                    # email delivery errors
```

Updating PDFDock (monthly is a good rhythm, for security patches):

```bash
git pull
docker compose build --pull
docker compose up -d
```

Backups: only the `pdfdock_auth-data` volume holds data (the list of
addresses). Losing it just means staff sign in again. No documents are ever
stored.

## PDF to Word: head office only, for now

`/api/pdf2word/` accepts a request only when all three hold:

1. the browser's address is in `headoffice-networks.conf`,
2. the person is signed in (nginx checks with the auth service),
3. nginx adds the service's API key itself; the key never reaches browsers.

Staff outside those ranges see "PDF to Word only works on the head-office
network for now" and can use every other tool normally. To open PDF to Word
to regional and district offices later, add their VPN or WAN ranges to
`headoffice-networks.conf` and run `docker compose restart web`.

## Regional and district offices

The app needs to reach this server once per device, to sign in and install.
Two ways:

- **Over FC's VPN/WAN**, if outstations have one: nothing else to set up.
- **Over the internet**: publish the site with Cloudflare Tunnel (outbound
  connection only, no open firewall ports, no static IP). See
  `services/pdf-to-word/DEPLOYMENT.md` Part 3 for the tunnel steps; point the
  tunnel at `https://localhost:443` of this server instead of the PDF to Word
  service. PDF to Word stays head-office-only because tunnelled requests don't
  come from head-office addresses.

After signing in once, staff can install the app (browser menu, then
**Install**) and use **Download tools for offline use** from their name menu
while on good Wi-Fi. From then on, every tool except PDF to Word works with no
connection.

## Security settings in place

- `security-headers.conf`: a Content-Security-Policy whose
  `connect-src 'self'` means the browser refuses to send data to any other
  server, plus HSTS, `X-Frame-Options: DENY`, `nosniff`, `no-referrer` and a
  Permissions-Policy that allows only the camera (for scanning).
- Sign-in codes and session tokens are stored only as keyed hashes. Codes
  expire after 10 minutes, lock after 5 wrong tries, and are rate-limited
  per address and per network.
- Session cookie: `HttpOnly`, `Secure`, `SameSite=Strict`; state-changing
  requests must come from the site's own origin.
- PDF to Word keeps uploads in RAM (`tmpfs`) and deletes them after each
  conversion; errors never reveal internal details.
