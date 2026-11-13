.PHONY: dev test lint build size e2e e2e-update og screenshots deploy

dev:
	cd frontend && npm run dev

# Unit tests: the simulation tool, then the frontend (which includes the pricing and routing engine).
test:
	node --test tools/*.test.js
	cd frontend && npm test

lint:
	cd frontend && npm run lint && npm run format:check && npx tsc --noEmit

build:
	cd frontend && npm run build

# First-page bundle budgets and the lazy-loading check.
size:
	cd frontend && npm run build && npm run size

# Browser tests. The Vite dev server is started by Playwright.
e2e:
	cd e2e && npm ci --silent && npx playwright install chromium webkit && npx playwright test

# Refresh the pixel baselines for this platform (see docs/adr/0005-testing-strategy.md).
e2e-update:
	cd e2e && npm run update-snapshots

# Regenerate the link-preview picture, frontend/public/og.png.
og:
	cd e2e && npm ci --silent && npx playwright install chromium && npm run og

# Regenerate the README screenshots in docs/images.
screenshots:
	cd e2e && npm ci --silent && npx playwright install chromium && npm run screenshots

# Build and publish to surge.sh. Set SURGE_DOMAIN, e.g. SURGE_DOMAIN=planet2planet.surge.sh make deploy
deploy:
	cd frontend && npm run deploy
