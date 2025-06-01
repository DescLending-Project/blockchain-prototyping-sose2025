# ====== Config ======
FRONTEND_IMAGE=tlsnotary-frontend
FRONTEND_CONTAINER=tlsnotary-frontend-container
FRONTEND_PORT=8092
FRONTEND_ENV=ZK/.env

PROXY_IMAGE=tlsnotary-backend
PROXY_CONTAINER=tlsnotary-backend-container
PROXY_PORT=3002
PROXY_ENV=proxy/.env

# ====== Targets ======

.PHONY: help build-frontend build-backend run-frontend run-backend run-dev logs-frontend logs-backend stop-frontend stop-backend shell-frontend shell-backend clean

help:
	@echo "Available targets:"
	@echo "  make build-frontend     - Build frontend Docker image"
	@echo "  make build-backend      - Build backend Docker image"
	@echo "  make run-frontend       - Run frontend container on port $(FRONTEND_PORT)"
	@echo "  make run-backend        - Run backend container on port $(PROXY_PORT)"
	@echo "  make run-dev            - Run frontend locally with Webpack Dev Server"
	@echo "  make logs-frontend      - Show frontend Docker logs"
	@echo "  make logs-backend       - Show backend Docker logs"
	@echo "  make stop-frontend      - Stop frontend Docker container"
	@echo "  make stop-backend       - Stop backend Docker container"
	@echo "  make shell-frontend     - Enter frontend container shell"
	@echo "  make shell-backend      - Enter backend container shell"
	@echo "  make clean              - Remove all Docker containers and images"

# ====== Frontend ======

build-frontend:
	docker build -f Dockerfile.frontend -t $(FRONTEND_IMAGE) .

run-frontend:
	docker run --rm -d --env-file $(FRONTEND_ENV) -p $(FRONTEND_PORT):80 --name $(FRONTEND_CONTAINER) $(FRONTEND_IMAGE)

run-dev:
	cd ZK && npm run dev

logs-frontend:
	docker logs -f $(FRONTEND_CONTAINER)

stop-frontend:
	docker stop $(FRONTEND_CONTAINER) || true

shell-frontend:
	docker exec -it $(FRONTEND_CONTAINER) sh

# ====== Backend ======

build-proxy:
	docker build -f Dockerfile.proxy -t $(PROXY_IMAGE) .

run-proxy:
	docker run --rm -d --env-file $(PROXY_ENV) -p $(PROXY_PORT):3002 --name $(PROXY_CONTAINER) $(PROXY_IMAGE)

logs-proxy:
	docker logs -f $(PROXY_CONTAINER)

stop-proxy:
	docker stop $(PROXY_CONTAINER) || true

shell-proxy:
	docker exec -it $(PROXY_CONTAINER) sh

# ====== General ======

clean: stop-frontend stop-proxy
	docker rmi -f $(FRONTEND_IMAGE) || true
	docker rmi -f $(PROXY_IMAGE) || true
