# Avatar Studio: one Next.js app (7140) and one assistant-runtime (7100).
SHELL := /bin/bash
.PHONY: help install dev preflight runtime test typecheck lint build check

help: ## List targets
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

install: ## Install app dependencies
	bun install

dev: preflight ## Run the app on http://127.0.0.1:7140 (start assistant-runtime yourself first)
	bun run dev

preflight: ## Check the configured runtime is reachable; never starts or stops it
	bun scripts/preflight.ts

runtime: ## Optional: launch assistant-runtime on 7100 with this app's settings; make dev never calls this
	scripts/runtime-up.sh $(ARGS)

test: ## Run unit tests
	bun run test

typecheck: ## TypeScript
	bun run typecheck

lint: ## ESLint
	bun run lint

build: ## Production build
	bun run build

check: test typecheck lint build ## Everything CI would run
