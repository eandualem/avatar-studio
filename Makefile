# Avatar Studio: one Next.js app (7140) talking to an assistant-runtime (7100)
# that the operator starts separately.
SHELL := /bin/bash
.PHONY: help install dev preflight test typecheck lint build check probe-jev

help: ## List targets
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

install: ## Install app dependencies
	bun install

dev: preflight ## Run the app on http://127.0.0.1:7140 (start assistant-runtime yourself first)
	bun run dev

preflight: ## Check the configured runtime is reachable; never starts or stops it
	bun scripts/preflight.ts

test: ## Run unit tests
	bun run test

typecheck: ## TypeScript
	bun run typecheck

lint: ## ESLint
	bun run lint

build: ## Production build
	bun run build

check: test typecheck lint build ## Everything CI would run

probe-jev: ## Ask Jev the live expression questions for sample lines through the runtime (it needs TYPESAFE_API_KEY)
	bun scripts/probe-jev.ts $(LINES)
