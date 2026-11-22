# 6.1040 Team Project

## App

The app is built on the class sync engine with Bun and MongoDB. The concept specs the engine checks are in `design/concepts/`, their implementations are in `src/concepts/` and registered in `src/concepts.ts`, and the outside lookups (Google Places and OpenTable links) are in `src/venues/`. The tests run on an in-memory MongoDB, so they need no setup.

```bash
bun install
```

```bash
bun test
```

```bash
bun run check && bun run check:design
```

The venue lookup reads `GOOGLE_PLACES_API_KEY` from `.env` (see `.env.example`) and returns no venues without it.

## F2

- [Problem Framing](F2/problem-framing.md)

## F3

- [User Journey](F3/user-journey.md)
- [Concept Design](F3/concept-design.md)
- [Design Summary](F3/design-summary.md)
- [Visual Design Study](F3/visual-design-study/visual-design-study.md) ([slides](F3/visual-design-study/visual-design-study.pptx), [PDF](F3/visual-design-study/visual-design-study.pdf))
- [Development Plan](F3/development-plan.md)
