# Avatar Studio: one Next.js app (7140) and one assistant-runtime (7100).
SHELL := /bin/bash
.PHONY: help install dev runtime test typecheck lint build check

help: ## List targets
	@grep -E '^[a-z]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

install: ## Install app dependencies
	bun install

dev: ## Run the app on http://127.0.0.1:7140
	bun run dev

runtime: ## Start assistant-runtime on 7100 from runtime/avatar-runtime.env (RUNTIME_DIR=../assistant-runtime)
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
