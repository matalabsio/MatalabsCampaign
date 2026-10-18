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

Vite builds the site into `dist/`. The included `vercel.json` configures deployment
on Vercel. Link this checkout to the desired Vercel project before deploying.

## Project files

- `Images/`: the six slide images and access screen logo.
- `src/data/slides.js`: slide order, descriptions, image imports, and link areas.
- `app.js`: access screen and slideshow navigation.
- `styles.css`: responsive layout, transitions, and access screen styles.
- `index.html`: document metadata and access form.

Vite bundles imported images automatically; each image has a single source copy.
Link bounds are measured against the 1279 × 1600 slide artwork. The contact slide
keeps its footer handle hidden while retaining the main Instagram contact link.

The access screen is a client-side presentation gate; it does not restrict direct
access to assets. Use Vercel deployment protection for server-enforced access.
