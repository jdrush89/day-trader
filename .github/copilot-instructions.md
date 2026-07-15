# Copilot Instructions

## Version Bumping

Always bump `GAME_VERSION` in `src/App.tsx` when making any code change that gets deployed. Increment the patch number (e.g., "0.0.79" → "0.0.80"). Do this in the same commit as the change, not as a separate commit.

## Deployment

Deploy by pushing to main: `git push origin jdrush89/roguelike-day-trader-game:main`

## Testing

Run `npx tsc --noEmit` and `npx vitest run` before deploying.

## Safe Revert

The last known-good version before the EOD state machine refactor is commit `cb1f5d0` (v0.0.73).
