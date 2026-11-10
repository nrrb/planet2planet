.PHONY: up down test test-backend lint-backend lint seed

up:
	docker compose up -d --wait

down:
	docker compose down

test: test-backend
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
	  python manage.py build_network"
