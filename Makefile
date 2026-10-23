SHELL := /bin/bash
COMPOSE := docker compose -f deploy/docker-compose.yml
PY := python3

.PHONY: help install test test-integration lint security up down logs certs secrets seed openapi clean

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install dev dependencies
	$(PY) -m pip install -r requirements-dev.txt

test: ## Run unit tests
	pytest -q -m "not integration" --cov=app --cov-report=term-missing

test-integration: ## Run Docker-backed integration tests
	pytest -q -m integration

lint: ## Ruff + compile
	ruff check app tests ui scripts
	$(PY) -m compileall -q app tests scripts ui

security: ## SAST + secret scan
	bandit -r app -c pyproject.toml -ll -ii
	semgrep --config security/semgrep.yml --error app
	gitleaks detect --config security/.gitleaks.toml --no-git -v

openapi: ## Export the OpenAPI schema to docs/openapi.json
	$(PY) scripts/export_openapi.py

certs: ## Generate local TLS certificates
	./scripts/gen-dev-certs.sh

secrets: ## Generate local secret files
	./scripts/gen-dev-secrets.sh

up: certs secrets ## Start the hardened stack
	$(COMPOSE) up -d --build

down: ## Stop the stack
	$(COMPOSE) down

logs: ## Tail API logs
	$(COMPOSE) logs -f api

seed: ## Provision tenant + admin (usage: make seed SLUG=acme EMAIL=a@b.c NAME="Acme" ADMIN_PASSWORD=...)
	@test -n "$${ADMIN_PASSWORD}" || (echo "ADMIN_PASSWORD is required"; exit 1)
	ADMIN_PASSWORD="$${ADMIN_PASSWORD}" \
	$(COMPOSE) --profile tools run --rm seed --slug "$(SLUG)" --name "$(NAME)" --email "$(EMAIL)"

clean: ## Remove local caches
	find . -name '__pycache__' -type d -prune -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache .coverage coverage.xml
