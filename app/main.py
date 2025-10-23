"""FastAPI application entrypoint."""

from __future__ import annotations

import logging

from fastapi import FastAPI

from app.api.router import api_router
from app.core.settings import configure_logging, settings
from app.services.library import LibraryPaths


def create_app() -> FastAPI:
    configure_logging()

    app = FastAPI(title=settings.project_name, version=settings.version)

    library = LibraryPaths(settings)

    @app.on_event("startup")
    async def _startup() -> None:  # pragma: no cover - side effect
        logging.getLogger(__name__).info("Ensuring directory structure exists")
        library.ensure_structure()

    app.include_router(api_router, prefix="/api/v1")

    @app.get("/health", tags=["system"])
    async def root_health() -> dict[str, str]:
        return {"status": "ok", "version": settings.version}

    return app


app = create_app()
