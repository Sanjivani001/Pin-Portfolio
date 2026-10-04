# Sanjivani Portfolio & Studio Desk

## Run the website

1. Install Node.js 20.x (the project is pinned to 20.13.1 in `.nvmrc`).
2. Install packages with `npm install`.
3. Copy `.env.example` to `.env`.
4. Set a private random `SESSION_SECRET` (at least 32 characters), the enquiry inbox, and a verified Resend sender/API key.
5. Start the site with `npm start`.
6. Open <http://localhost:3000>.

The existing public portfolio, project gallery, services, invitation showcase and chat-style enquiry are served from the same app. The enquiry records are saved to the private database before email is sent; on email-provider failure, the user sees a prefilled `mailto:` fallback and the saved enquiry remains available in Studio Desk.

## Private admin dashboard

- Open <http://localhost:3000/admin>. This route is not linked from the public portfolio navigation and is marked `noindex`.
- Create the first admin interactively from a terminal in the project folder with `node --env-file=.env server.js create-admin`. Password entry is hidden; use a strong password of at least 12 characters.
- Sign in with that email/password. There are no demo accounts or fake dashboard records.
- Log out with the sidebar control. Admin API routes require a valid server-side session, same-site CSRF token and authenticated admin.
- To reset an account password, run `node --env-file=.env server.js reset-admin-password`. Existing sessions for that account are revoked.

For an environment-based first admin instead, generate a hash interactively with `node --env-file=.env server.js hash-password`, set `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` in `.env`, and start the app once. Bootstrap only creates an admin when the database has none; it does not reset a password on app restarts.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Required, private random secret (32+ characters) used to protect session and CSRF tokens. |
| `DATABASE_PATH` | SQLite database file path. Defaults to `data/portfolio.sqlite`, which is excluded from Git and blocked by the static file allow-list. |
| `CONTACT_EMAIL` | Inbox for website enquiry notifications and public Email Me links. |
| `CONTACT_FROM` | Verified sender address allowed by Resend. |
| `RESEND_API_KEY` | Private Resend API key. Server-only; never expose it in frontend code. |
| `ADMIN_EMAIL` | Optional email used only for one-time first-admin bootstrap when paired with a valid scrypt `ADMIN_PASSWORD_HASH`. |
| `ADMIN_PASSWORD_HASH` | Optional one-time first-admin bootstrap hash; never put a plain-text password here. Use the `hash-password` command to generate it. |
| `PORT` | Optional HTTP port. Defaults to `3000`. |

Keep `.env` out of source control. On deployment, set these values with the hosting provider and serve over HTTPS.

## Data and privacy

Enquiries, conversation transcripts, clients, projects, payment receipts, scrypt password hashes and hashed session identifiers live in the server-side SQLite database. The database is not in the static asset allow-list. Public endpoints do not return private client, project or financial data. Keep backups of `DATABASE_PATH` private and encrypted.

Dashboard earnings are derived from recorded project amounts and payments. Currency is displayed as a locale-formatted number because no currency was specified. Enquiry-to-project conversion and other analytics are derived from saved records and show empty states when there is not yet data.
# Pin-Portfolio
