"""System resource information endpoint."""
from __future__ import annotations
import subprocess
from fastapi import APIRouter
import psutil

router = APIRouter(prefix="/system", tags=["system"])

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
def kill_process(pid: int):
    try:
        proc = psutil.Process(pid)
        name = proc.name()
        proc.terminate()
        return {"killed": True, "pid": pid, "name": name}
    except psutil.NoSuchProcess:
        return {"killed": False, "reason": "Process not found"}
    except psutil.AccessDenied:
        return {"killed": False, "reason": "Access denied"}
