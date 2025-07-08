# CONFIG
IMAGE_NAME = rbbozkurt/dstack-service
TAG ?= latest
DOCKER_PLATFORM = linux/amd64
PORT = 8081
ENV_FILE = .env
CONTAINER_NAME = dstack-service

# Build the Docker image for local use
build:
	docker buildx build --platform $(DOCKER_PLATFORM) -t $(IMAGE_NAME):$(TAG) .

# Push the built image to Docker Hub
push: build
	docker push $(IMAGE_NAME):$(TAG)

# Run locally with Docker
run: build
	docker run -d --name $(CONTAINER_NAME) -p $(PORT):$(PORT) \
		--env-file $(ENV_FILE) $(IMAGE_NAME):$(TAG)

# Stop and remove local container
stop:
	docker stop $(CONTAINER_NAME) && docker rm $(CONTAINER_NAME)

# View logs
logs:
	docker logs -f $(CONTAINER_NAME)

# Show container status
status:
	docker ps -a | grep $(CONTAINER_NAME)

# Clean up dangling images
clean:
	docker system prune -f

# Add this to your Makefile
build-native:
	docker buildx build -t $(IMAGE_NAME):$(TAG) .

run-native: build-native
	docker run -d --name $(CONTAINER_NAME) -p $(PORT):$(PORT) \
        --env-file $(ENV_FILE) $(IMAGE_NAME):$(TAG)