"""Agent registry for diagnostics."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Iterable, List

from app.api.schemas import AgentStatus


@dataclass
class AgentRecord:
    name: str
    scope: List[str]
    healthy: bool = True
    last_heartbeat: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_model(self) -> AgentStatus:
        return AgentStatus(
            name=self.name,
            scope=self.scope,
            healthy=self.healthy,
            last_heartbeat=self.last_heartbeat,
        )


class AgentRegistry:
    def __init__(self) -> None:
        self._agents: Dict[str, AgentRecord] = {}

    def bootstrap(self, records: Iterable[AgentRecord]) -> None:
        for record in records:
            self._agents[record.name] = record

    def list_agents(self) -> List[AgentStatus]:
        return [record.to_model() for record in self._agents.values()]

    def update_heartbeat(self, name: str) -> None:
        record = self._agents.get(name)
        if record:
            record.last_heartbeat = datetime.now(timezone.utc)


agent_registry = AgentRegistry()
agent_registry.bootstrap([
    AgentRecord(
        name="FileOps",
        scope=[
            "/Volumes/deep-1t/Users/k3ss/projects/music-matters",
            "/Volumes/hotblack-2tb/mm-files",
        ],
    ),
    AgentRecord(
        name="FetchAgent",
        scope=["yt-dlp", "soundcloud"],
    ),
    AgentRecord(
        name="ComputeRunner",
        scope=["demucs", "librosa", "essentia"],
    ),
    AgentRecord(
        name="BrowserAgent",
        scope=["chrome-devtools"],
        healthy=False,
    ),
    AgentRecord(
        name="RESTApiAgent",
        scope=["/api/v1"],
    ),
])

__all__ = ["agent_registry", "AgentRegistry", "AgentRecord"]
