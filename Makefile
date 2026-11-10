.PHONY: up down test

up:
	docker compose up -d --wait

down:
	docker compose down

test:
	cd frontend && npm test
