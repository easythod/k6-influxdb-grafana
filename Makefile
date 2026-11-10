# PREBUILT=1 uses the published amd64 restful-booker image instead of building it from source.
ifeq ($(PREBUILT),1)
  COMPOSE := docker compose -f docker-compose.yml -f compose.prebuilt.yml
else
  COMPOSE := docker compose
endif

PROFILE ?= smoke
TEST    ?= booking-crud.ts
TESTID  ?= $(PROFILE)-$(shell date +%Y%m%d-%H%M%S)

INFLUXDB_OUT   := -o influxdb=http://influxdb:8086/k6
PROMETHEUS_OUT := -o experimental-prometheus-rw
# OUT=influxdb | prometheus | both
OUT ?= both
ifeq ($(OUT),influxdb)
  OUTPUTS := $(INFLUXDB_OUT)
else ifeq ($(OUT),prometheus)
  OUTPUTS := $(PROMETHEUS_OUT)
else
  OUTPUTS := $(INFLUXDB_OUT) $(PROMETHEUS_OUT)
endif

.PHONY: help up down clean test smoke load stress spike typecheck logs

help: ## Show available commands
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  make %-10s %s\n", $$1, $$2}'

up: ## Start restful-booker, InfluxDB, Prometheus and Grafana
	$(COMPOSE) up -d --wait --build
	@echo "Grafana: http://localhost:3000"

down: ## Stop the stack, keep stored results
	$(COMPOSE) down

clean: ## Stop the stack and delete all stored results
	$(COMPOSE) down -v
	rm -f reports/*.html

test: ## Run a test: make test PROFILE=load OUT=both
	@mkdir -p reports && chmod a+w reports # k6 runs as a non-root user inside the container
	$(COMPOSE) run --rm --service-ports \
		-e PROFILE=$(PROFILE) \
		-e K6_WEB_DASHBOARD_EXPORT=/reports/$(TESTID).html \
		k6 run --tag testid=$(TESTID) $(OUTPUTS) /tests/$(TEST)
	@echo "HTML report: reports/$(TESTID).html"

smoke: ## 1 iteration/s for 30s: does the flow work at all?
	@$(MAKE) --no-print-directory test PROFILE=smoke

load: ## 10 iterations/s for ~4.5 min: expected production load
	@$(MAKE) --no-print-directory test PROFILE=load

stress: ## Ramp up to 40 iterations/s: where does it start to degrade?
	@$(MAKE) --no-print-directory test PROFILE=stress

spike: ## Sudden jump to 50 iterations/s and back: does it recover?
	@$(MAKE) --no-print-directory test PROFILE=spike

typecheck: ## Type-check the TypeScript tests
	npm run typecheck

logs: ## Follow logs of all services
	$(COMPOSE) logs -f
