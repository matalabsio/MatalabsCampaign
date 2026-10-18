# MATA Labs — Director Profile

A six-slide profile presentation for Kiriti Mortha, Director of MATA Labs OPC.

## Features

- Original slide artwork displayed in full on desktop and mobile.
- Desktop wheel and keyboard navigation, plus mobile swipe and edge taps.
- Clickable SDOT, BandForge, Instagram, LinkedIn, email, and WhatsApp links.
- Access key screen with a show/hide password button and six-hour sessions.

## Development

Requires Node.js and npm.

```sh
npm ci
npm run dev
npm run build
npm run preview
```

Vite builds the site into `dist/`.

## Deploy from the company Vercel account

1. Select the company team in Vercel, then choose **Add New → Project**.
2. Import `matalabsio/MatalabsCampaign` from GitHub, using branch `main`.
3. Select **Vite**, keep the root directory at the repository root, use
   `npm run build` as the build command and `dist` as the output directory.
4. Deploy. No environment variables are required by the application.
5. Open **Settings → Domains** and add `kirthi.mortha.matalabs.io`.
6. At the DNS provider for `matalabs.io`, create the CNAME record Vercel shows.
   The record name is typically `kirthi.mortha`; copy the exact target from Vercel.
7. Wait for Vercel to report a valid domain configuration and an active certificate.

This checkout has no Vercel project link or deployment overrides. `.vercel/` stays
ignored so a future local link is never committed. Web links open in new tabs;
the email link opens the visitor's configured email application.

## Session analytics backend

The Vercel frontend can connect to a Cloudflare Worker and the shared Neon
analytics database. See [backend/README.md](backend/README.md) for the full
Cloudflare setup, migration, secrets, testing, reporting and retention steps.

Set `VITE_ANALYTICS_API_URL` in Vercel only after the Worker and database are
verified. Until then, the existing local presentation gate and Vercel Web
Analytics continue to work. Configuring the custom API replaces Vercel tracking.
The new tracker never requests browser permissions or collects location.

## Project files

- `Images/`: the six slide images, access screen logo, and browser icons.
- `src/data/slides.js`: slide order, descriptions, image imports, and link areas.
- `app.js`: access screen and slideshow navigation.
- `styles.css`: responsive layout, transitions, and access screen styles.
- `index.html`: document metadata and access form.

Vite bundles imported images automatically; each image has a single source copy.
Link bounds are measured against the 1279 × 1600 slide artwork. The contact slide
keeps its footer handle hidden while retaining the main Instagram contact link.

The access screen is a client-side presentation gate; it does not restrict direct
access to assets. Use Vercel deployment protection for server-enforced access.
