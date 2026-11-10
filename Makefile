.PHONY: up down test test-backend lint-backend lint

up:
	docker compose up -d --wait

down:
	docker compose down

test: test-backend
	cd frontend && npm test

test-backend:
	docker compose run --rm backend pytest

lint-backend:
	docker compose run --rm backend sh -c "ruff check . && ruff format --check ."

lint: lint-backend
	cd frontend && npm run lint && npm run format:check && npx tsc --noEmit
