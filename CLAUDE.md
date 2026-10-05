# SAMBHAVYA prototype — project rules

- Front-end only. No backend, no fetch, no external network calls at runtime.
- Vite + React 18 + TypeScript (strict; never use `any`). Functional components and hooks.
- Tailwind with CSS-variable tokens from docs/PROTOTYPE_SPEC.md Part 2. Do not invent new colours.
- Fonts: IBM Plex Sans Condensed (headlines) + IBM Plex Sans (body), self-hosted via @fontsource.
- All data comes from src/sim (seeded, deterministic). Every data view shows the "Replay · illustrative values" chip.
- Never show SIH, problem-statement IDs, team names or team IDs.
- Only state real facts listed in docs/PROTOTYPE_SPEC.md Part 1. Everything else is illustrative.
- Risk colours (yellow/orange/red) are used only for risk.
- Sentence case. No all-caps labels, no emoji, no "→" in button text.
- Respect prefers-reduced-motion. Keyboard focus visible. Responsive down to 375 px.
- After each task: run `npm run build` and fix all type errors before finishing.
