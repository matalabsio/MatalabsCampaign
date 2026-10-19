# Cloudflare analytics API + Neon

Frontend hosting remains on Vercel. This Worker deploys only the API and an admin
report page. It has no location API calls, geographic headers, fingerprints,
third-party cookies, or browser permission requests.

## Deployment order

1. In the existing Neon project (`Analytics_DB_All` is a project label, not a SQL
   database identifier), select the intended database and production branch.
   Run `backend/migrations/001_analytics.sql` in its SQL Editor. It is safe to
   rerun. All objects live in the `analytics` schema; existing unrelated tables
   are not changed. The default site ID is `matalabs-campaign`.
2. In the company Cloudflare account, go to Workers & Pages → Create application
   → Import/connect a Git repository. Grant access to
   `matalabsio/MatalabsCampaign` and select branch `main`, repository root.
3. Leave the build command empty. Set the deploy command to
   `npx wrangler deploy --config wrangler.analytics.jsonc`. Worker name must
   match `matalabs-campaign-analytics` in the config. Deploy once. The public
   `/health` route confirms the Worker is running; it does not query Neon.
4. Open Worker → Settings → Variables and Secrets. Add these as **Secrets**:
   `DATABASE_URL` (Neon connection string with SSL), `PRESENTATION_PASSWORD`
   (the visitor key), `SESSION_SECRET` (at least 32 random characters), and
   `ADMIN_PASSWORD` (a DIFFERENT password, at least 16 characters).
   Save/deploy the new Worker version. Never add these to Vercel frontend vars.
   These are runtime secrets, not build variables. Database connection details
   and password values are never logged or returned by the API.
5. The config includes `SITE_ID=matalabs-campaign`, `SLIDE_COUNT=6`, and these
   exact allowed origins: `https://kiriti.mortha.matalabs.io` and
   `https://matalabs-campaign.vercel.app`. Edit the config if your actual domains
   differ. Do not add a trailing slash, wildcard, or old personal deployment.
   Configured vars in Wrangler are authoritative on subsequent deployments.
6. Rate limiter namespace IDs `724001`, `724002`, `724003` must be unique to
   these bindings within your Cloudflare account. If already used by another
   application, choose three unused integer IDs in the config before deploying.
   Limits are per Cloudflare location, not a globally strict quota. Login is
   limited to 20/minute per IP (shared office networks share that allowance),
   uploads to 120/minute per signed session, reports to 30/minute per IP.
7. Open `https://YOUR-WORKER.workers.dev/admin` and enter the admin password.
   An empty report verifies secrets, database connectivity, and the migration.
   Never share this password with presentation visitors. The password stays in
   the admin page's memory; reports use Authorization headers and no URL secrets.
8. In Vercel → existing company project → Settings → Environment Variables,
   set **Production** `VITE_ANALYTICS_API_URL=https://YOUR-WORKER.workers.dev`.
   This URL is intentionally public. Redeploy the Vercel frontend. Do not add
   this production API URL to previews unless their exact origins are allowed.
9. Test the production presentation and compare results in `/admin`. No DNS,
   nameserver migration, R2 bucket, or Vercel Pro feature is needed for the API.
   Existing Vercel commercial-use plan requirements still apply to frontend hosting.

## Measurements and limitations

- `opened_at`: client-reported page-open timestamp (bounded/validated).
- `unlocked_at` and `last_seen_at`: server timestamps, displayed in IST by admin.
- Elapsed time: monotonic time since opening, including the password screen and
  time away. It ends at the latest successfully received snapshot, NOT proof of
  the exact time the visitor closed the browser.
- Viewing time: sum of per-slide time while the document is visible AND focused
  after unlock. One-second sampling caps long suspension gaps to five seconds;
  this errs toward undercounting device sleep and timer throttling. It measures
  exposure, not attention. Multiple sessions can belong to the same person.
- Each page load/unlock creates a new signed session, valid for up to six hours
  from opening. Bearer tokens and passwords are not persisted in browser storage.
  Refreshing therefore asks for the presentation key again when the API is on.
- A random browser identifier in localStorage estimates returning browsers, not
  unique humans. Blocked/cleared storage, incognito, and different devices change
  the ID. No IP-based fingerprinting is performed.
- Heartbeat snapshots every 15 seconds plus slide changes, link clicks, blur,
  and page hide. Retries use monotonic sequence numbers and cumulative counters.
  Events use UUIDs. Duplicate and stale uploads cannot double count. Keepalive
  requests improve exit delivery, but a browser crash/offline close can lose
  the final interval and unsent clicks. Up to 200 unacknowledged click/slide
  events are held in memory, sent 40 at a time; very long outages can drop events.
- `?share=invite_123` is stored as a bounded tag. It shows use of an invitation
  URL, NOT whether someone forwarded it. There is no claim of automatic sharing
  detection. Referrer URLs, query strings beyond this tag, and passwords are not
  logged as analytics data.
- IP is taken only from Cloudflare's `CF-Connecting-IP`, not a browser body or
  `X-Forwarded-For`. It identifies a network connection, not a verified person.
- The unlock screen has no analytics notice or permission prompt. Maintain the
  company privacy policy and access process for these records separately.
- Successful analytics activation uses server-side authentication. Images are
  still public static assets on Vercel; this does NOT make the entire deck private.

## Shared database and future sites

Reuse this migration and the `analytics.sites`, `sessions`, `slide_timings`, and
`events` tables. For another site, insert a row in `analytics.sites` and deploy a
separately configured Worker with a distinct name, SITE_ID, SLIDE_COUNT, allowed
origins, rate-limit namespaces, and secrets. Each Worker is bound to its site
server-side; a client cannot select a different tenant. Reports and cleanup
queries always include that site ID. These are logical application boundaries;
the database role can access other sites, so use separate roles/databases if
stronger organizational isolation is required.

## Retention and reporting

Automatic deletion is currently **disabled**. `RETENTION_ENABLED` defaults to
`false`, and the deployment config has no Cron Triggers. The scheduled handler
also does nothing unless this flag is explicitly `true`, so an old dashboard
schedule cannot clear data after the new version is deployed. Sessions, events,
slide timings and IP addresses remain in Neon. This cannot restore data already
deleted by an earlier version.

The reporting dashboard defaults to **All time** and shows the latest 100
sessions, with all-time aggregates. Date-window filters remain available. Each
session detail includes up to 500 events.

To restore retention later, set `RETENTION_ENABLED` to `true` in the committed
Worker config AND add a Cron Trigger. The retained cleanup implementation clears
IPs after 7 days and deletes sessions with cascading events/timings after 90 days.
Do not enable it until the company explicitly chooses to resume deletion.

Link IDs use zero-based slide and link index: `4:0` SDOT, `4:1` BandForge,
`5:0` Instagram, `5:1` email, `5:2` WhatsApp, `5:3` LinkedIn.

## Local verification

`npm test` exercises cryptographic session isolation, input/body bounds, timing,
retries, actual PostgreSQL queries via PGlite, replay protection, admin access,
tenant isolation and retention. `npm run build` builds the Vercel frontend.
Install Wrangler globally in your user profile to run:

```sh
wrangler deploy --dry-run --config wrangler.analytics.jsonc --outdir .worker-build
```

For local Worker development, create a gitignored root `.dev.vars` from the
example in this folder, use a separate Neon development branch, then run:

```sh
wrangler dev --config wrangler.analytics.jsonc --var ALLOWED_ORIGINS:http://localhost:5173
```

Put `VITE_ANALYTICS_API_URL=http://localhost:8787` in gitignored `.env.local` and
restart Vite. Never use your production database for development tests.

## Rollback

Remove the Vercel API URL and redeploy to return to the existing local password
gate without custom tracking. Disabling the Worker stops API ingestion; the
migration does not drop company data. Turning off the Worker while the frontend
still points to it prevents new server-side unlocks. Deploy and test the backend
before enabling the frontend variable.

## Dependency audit

The production dependency audit passes with no known advisories at implementation
time. The existing Vite 5 development toolchain has advisory findings (Vite,
esbuild, source-map-js); these are not Worker runtime dependencies. Do not expose
the Vite development server publicly. Updating the frontend toolchain is a
separate maintenance change and was not bundled into this feature.
