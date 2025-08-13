# Makefile for the ADK Streaming Test

.PHONY: help install run adk-api

help:
	@echo "Commands:"
	@echo "  install: Installs dependencies from pyproject.toml"
	@echo "  run    : Runs the FastAPI application with uvicorn"

install:
	uv pip install -e .

run:
	uv run uvicorn main:app --reload --port 8881 --host 0.0.0.0

adk-api:
	uv run adk api_server --reload_agents --port 8882 --host 0.0.0.0 --allow_origins '*' agents

adk-web:
	uv run adk web --reload_agents --port 8882 --allow_origins '*' --host 0.0.0.0 agents

dev:
	uv run python main.py