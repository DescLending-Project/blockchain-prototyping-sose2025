# Load configuration
include Makefile.vars

# Frontend
FRONTEND_NAME=tlsnotary-frontend
FRONTEND_IMAGE=$(FRONTEND_NAME)
FRONTEND_CONTAINER=$(FRONTEND_NAME)-container
FRONTEND_PORT=8092
FRONTEND_ENV_FILE=ZK/.env
FRONTEND_HOST=localhost

# Backend (Proxy)
PROXY_NAME=tlsnotary-backend
PROXY_IMAGE=$(PROXY_NAME)
PROXY_CONTAINER=$(PROXY_NAME)-container
PROXY_PORT=3002
PROXY_HOST=localhost
PROXY_ENV_FILE=proxy/.env

# Shared API URL
PROXY_API_URL=http://$(PROXY_HOST):$(PROXY_PORT)

# =======================
# ====== TARGETS ========
# =======================

.PHONY: help build-frontend build-proxy run-frontend run-proxy run-dev \
        logs-frontend logs-proxy stop-frontend stop-proxy \
        shell-frontend shell-proxy clean \
        compose-build compose-up compose-down compose-restart compose-logs

help:
	@echo "Available targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' Makefile | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ====== Frontend ======
build-frontend: ## Build frontend Docker image
	docker build \
		-f Dockerfile.frontend \
		--build-arg PORT=$(FRONTEND_PORT) \
		--build-arg HOST_NAME=$(FRONTEND_HOST) \
		--build-arg PROXY_API_URL=$(PROXY_API_URL) \
		-t $(FRONTEND_IMAGE) .

run-frontend: ## Run frontend container
	docker run --rm -d --env-file $(FRONTEND_ENV_FILE) \
		-p $(FRONTEND_PORT):80 \
		--name $(FRONTEND_CONTAINER) $(FRONTEND_IMAGE)

run-dev: ## Run frontend locally with Webpack Dev Server
	cd ZK && npm run dev

logs-frontend: ## Show frontend logs
	docker logs -f $(FRONTEND_CONTAINER)

stop-frontend: ## Stop frontend container
	docker stop $(FRONTEND_CONTAINER) || true

shell-frontend: ## Shell into frontend container
	docker exec -it $(FRONTEND_CONTAINER) sh

# ====== Backend (Proxy) ======
build-proxy: ## Build backend Docker image
	docker build \
		-f Dockerfile.proxy \
		--build-arg PORT=$(PROXY_PORT) \
		--build-arg HOST_NAME=$(PROXY_HOST) \
		-t $(PROXY_IMAGE) .

run-proxy: ## Run backend container
	docker run --rm -d --env-file $(PROXY_ENV_FILE) \
		-p $(PROXY_PORT):3002 \
		--name $(PROXY_CONTAINER) $(PROXY_IMAGE)

logs-proxy: ## Show backend logs
	docker logs -f $(PROXY_CONTAINER)

stop-proxy: ## Stop backend container
	docker stop $(PROXY_CONTAINER) || true

shell-proxy: ## Shell into backend container
	docker exec -it $(PROXY_CONTAINER) sh

# ====== Docker Compose ======
compose-build: ## Build all services with Docker Compose
	docker-compose build

compose-up: ## Start all services with Docker Compose
	docker-compose up -d

compose-down: ## Stop and remove all Docker Compose containers
	docker-compose down

compose-restart: ## Restart all Docker Compose services
	docker-compose restart

compose-logs: ## Show logs for all Docker Compose services
	docker-compose logs -f

# ====== General ======
clean: stop-frontend stop-proxy ## Clean up all containers and images
	docker rmi -f $(FRONTEND_IMAGE) || true
	docker rmi -f $(PROXY_IMAGE) || true
