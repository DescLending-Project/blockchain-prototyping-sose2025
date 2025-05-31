# ====== Config ======
IMAGE_NAME=tlsnotary-proxy
CONTAINER_NAME=tlsnotary-proxy-container
ENV_FILE=.env
PORT=3002

# ====== Targets ======

.PHONY: help build run run-docker run-local logs stop shell clean

help:
	@echo "Available targets:"
	@echo "  make build         - Build Docker image"
	@echo "  make run-docker    - Run container with .env"
	@echo "  make run-local     - Run app locally via ts-node"
	@echo "  make logs          - Show Docker logs"
	@echo "  make stop          - Stop Docker container"
	@echo "  make shell         - Enter Docker container shell"
	@echo "  make clean         - Remove Docker container + image"

build:
	docker build -t $(IMAGE_NAME) .

run-docker:
	docker run --rm -d --env-file $(ENV_FILE) -p $(PORT):3002 --name $(CONTAINER_NAME) $(IMAGE_NAME)

run-local:
	@echo "Running locally using ts-node..."
	npm run start

logs:
	docker logs -f $(CONTAINER_NAME)

stop:
	docker stop $(CONTAINER_NAME) || true

shell:
	docker exec -it $(CONTAINER_NAME) sh

clean: stop
	docker rmi -f $(IMAGE_NAME) || true
