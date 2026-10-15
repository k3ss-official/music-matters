"""System resource information endpoint."""
from __future__ import annotations

import os
import signal
import threading
import time

from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
import psutil

from app.config import settings, set_music_library
from app.security import is_localhost, is_self_or_init

router = APIRouter(prefix="/system", tags=["system"])


class LibraryPathRequest(BaseModel):
    path: Optional[str] = None
    reset: bool = False


FORBIDDEN_LIBRARY_ROOTS = {
    Path("/"),
    Path("/bin"),
    Path("/sbin"),
    Path("/usr"),
    Path("/etc"),
    Path("/var"),
    Path("/System"),
    Path("/Library"),
}


def _build_library_config() -> dict:
    lib = Path(settings.MUSIC_LIBRARY).expanduser().resolve()
    default_lib = (Path.home() / "music-matters").expanduser().resolve()
    return {
        "music_library": str(lib),
        "default_music_library": str(default_lib),
        "downloads_dir": str(settings.resolved_downloads_dir),
        "stems_dir": str(settings.resolved_stems_dir),
        "loops_dir": str(settings.resolved_loops_dir),
        "projects_dir": str(settings.resolved_projects_dir),
        "exists": lib.exists(),
        "writable": os.access(lib, os.W_OK) if lib.exists() else True,
    }


@router.get("/config")
def get_system_config():
    """Return current music library folder configuration and paths."""
    return _build_library_config()


@router.get("/library-path")
def get_library_path():
    """Return current default music folder configuration."""
    return _build_library_config()


@router.post("/library-path")
def update_library_path(payload: LibraryPathRequest, request: Request):
    """Set or reset the default music folder (MUSIC_LIBRARY). Localhost only."""
    if not is_localhost(request):
        raise HTTPException(status_code=403, detail="Local requests only")

    if payload.reset:
        target = (Path.home() / "music-matters").expanduser().resolve()
    else:
        raw = (payload.path or "").strip()
        if not raw:
            raise HTTPException(status_code=400, detail="Music folder path cannot be empty")
        target = Path(raw).expanduser().resolve()

    if target in FORBIDDEN_LIBRARY_ROOTS:
        raise HTTPException(status_code=400, detail="Cannot use system root directory as music folder")

    try:
        resolved = set_music_library(target)
        from app.services.library import LibraryPaths
        from app.services.pipeline import pipeline

        pipeline._library = LibraryPaths(settings)
        pipeline._downloader.downloads_dir = settings.resolved_downloads_dir
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=f"Permission denied creating folder: {target}") from exc
    except OSError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid folder path: {exc}") from exc

    return {
        **_build_library_config(),
        "music_library": str(resolved),
        "updated": True,
    }

KNOWN_HEAVY_APPS = {
    "Photoshop", "Lightroom", "Final Cut Pro", "DaVinci Resolve",
    "Logic Pro", "Ableton Live", "Adobe Premiere", "After Effects",
    "Chrome", "Firefox", "Safari", "Slack", "Zoom", "Teams",
    "Docker", "VirtualBox", "Parallels", "Xcode",
}


@router.get("/resources")
def get_resources():
    vm = psutil.virtual_memory()
    processes = []
    for proc in psutil.process_iter(['pid', 'name', 'memory_info', 'status']):
        try:
            mi = proc.info['memory_info']
            rss_mb = mi.rss / 1024 / 1024 if mi else 0
            if rss_mb < 50:
                continue
            name = proc.info['name'] or ''
            processes.append({
                "pid": proc.info['pid'],
                "name": name,
                "rss_mb": round(rss_mb, 1),
                "is_heavy": any(app.lower() in name.lower() for app in KNOWN_HEAVY_APPS),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    processes.sort(key=lambda p: p["rss_mb"], reverse=True)
    return {
        "total_mb": round(vm.total / 1024 / 1024),
        "used_mb": round(vm.used / 1024 / 1024),
        "available_mb": round(vm.available / 1024 / 1024),
        "percent_used": vm.percent,
        "processes": processes[:20],
    }


@router.post("/kill/{pid}")
def kill_process(pid: int, request: Request):
    if not is_localhost(request):
        raise HTTPException(status_code=403, detail="Local requests only")
    if is_self_or_init(pid):
        raise HTTPException(status_code=403, detail="Refusing to kill this process")
    try:
        proc = psutil.Process(pid)
        name = proc.name()
        if not any(app.lower() in name.lower() for app in KNOWN_HEAVY_APPS):
            raise HTTPException(status_code=403, detail="PID is not a known heavy app")
        proc.terminate()
        return {"killed": True, "pid": pid, "name": name}
    except HTTPException:
        raise
    except psutil.NoSuchProcess:
        return {"killed": False, "reason": "Process not found"}
    except psutil.AccessDenied:
        return {"killed": False, "reason": "Access denied"}


@router.post("/shutdown")
def shutdown(request: Request):
    """Stop the local server. Localhost only — used by the macOS app Quit button."""
    if not is_localhost(request):
        raise HTTPException(status_code=403, detail="Local requests only")

    def _exit() -> None:
        time.sleep(0.4)
        os.kill(os.getpid(), signal.SIGTERM)

    threading.Thread(target=_exit, daemon=True).start()
    return {"ok": True, "message": "Shutting down"}
