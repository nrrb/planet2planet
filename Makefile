.PHONY: up down test test-backend lint-backend lint seed schema e2e e2e-update size deploy deploy-status deploy-ssh destroy

up:
	docker compose up -d --wait

down:
	docker compose down

test: test-backend
	node --test tools/*.test.js
	cd frontend && npm test

test-backend:
	docker compose run --rm backend pytest --ds=config.settings.test

lint-backend:
	docker compose run --rm backend sh -c "ruff check . && ruff format --check ."

lint: lint-backend
	cd frontend && npm run lint && npm run format:check && npx tsc --noEmit

seed:
	docker compose run --rm backend sh -c "python manage.py migrate && \
	  python manage.py load_dataset && python manage.py load_orbital_elements && \
	  python manage.py build_network && python manage.py generate_plans && \
	  python manage.py load_canon_facts && python manage.py load_simulation"

schema:
	docker compose run --rm backend python manage.py spectacular --file openapi.yaml --validate
	cd frontend && npm run types

# Browser tests. Needs `make up && make seed`; the Vite dev server is started by Playwright.
e2e:
	cd e2e && npm ci --silent && npx playwright install chromium webkit && npx playwright test

# Refresh the pixel baselines for this platform (see docs/adr/0005-testing-strategy.md).
e2e-update:
	cd e2e && npm run update-snapshots

# First-page bundle budgets and the lazy-loading check.
size:
	cd frontend && npm run build && npm run size

# AWS (Lightsail). See docs/adr/0006-aws-deployment.md. Uses the AWS profile "planet2planet".
deploy:
	deploy/deploy.sh deploy

deploy-status:
	deploy/deploy.sh status

deploy-ssh:
	deploy/deploy.sh ssh

destroy:
	deploy/deploy.sh destroy
