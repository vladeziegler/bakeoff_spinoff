# Makefile for the ADK Streaming Test

.PHONY: help install run

help:
	@echo "Commands:"
	@echo "  install: Installs dependencies from pyproject.toml"
	@echo "  run    : Runs the FastAPI application with uvicorn"

install:
	uv pip install -e .

run:
	uv run uvicorn main:app --reload --port 8881 --host 0.0.0.0

dev:
	uv run python main.py