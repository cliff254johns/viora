# Implementation decisions

- The public-facing directory is named `riders.html`.
- Public maps show only aggregated density cells, never individual rider pins, names, or exact coordinates.
- Approximate area is coarsened in the browser to geohash precision 6 before a write, and presence sharing is opt-in and foreground-only.
- Public contact buttons are direct `tel:` and `wa.me` links and only appear after explicit phone-publication consent.
- Challenge awards are profile badges only. Leader display is visually highlighted and tied leaders are shown together; all other leaderboard names are first names only.
- Moderation is manual through the owner console.
- RTDB client-side aggregation and challenge progress are accepted v1 trade-offs; production deployments should monitor abuse and consider trusted server-side aggregation later.
- Public profile phone values are only allowed when `phonePublic` is true; private phone data remains in the rider profile node.
