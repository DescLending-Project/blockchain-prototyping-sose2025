# Configuration
COMPOSE_FILE = docker-compose.yml

# Start all services
up:
	docker-compose -f $(COMPOSE_FILE) up -d

# Build and start all services
build-up:
	docker-compose -f $(COMPOSE_FILE) up -d --build

# Stop all services
down:
	docker-compose -f $(COMPOSE_FILE) down

# Stop all services and remove volumes
clean:
	docker-compose -f $(COMPOSE_FILE) down -v

# Show logs for all services
logs:
	docker-compose -f $(COMPOSE_FILE) logs -f

# Show logs for specific service (use: make service-logs SERVICE=service-name)
service-logs:
	docker-compose -f $(COMPOSE_FILE) logs -f $(SERVICE)

# Restart all services
restart: down up

# Restart specific service (use: make restart-service SERVICE=service-name)
restart-service:
	docker-compose -f $(COMPOSE_FILE) restart $(SERVICE)

# Build images
build:
	docker-compose -f $(COMPOSE_FILE) build

# Show status of services
status:
	docker-compose -f $(COMPOSE_FILE) ps

# Build and push images
push: build
	docker-compose -f $(COMPOSE_FILE) push

# Pull latest images
pull:
	docker-compose -f $(COMPOSE_FILE) pull

.PHONY: up build-up down clean logs service-logs restart restart-service build status push pull