"""Force a throwaway MUSIC_LIBRARY before the app (and its SQLite) import."""
from __future__ import annotations

import os
import tempfile

if not os.environ.get("MUSIC_LIBRARY"):
    os.environ["MUSIC_LIBRARY"] = tempfile.mkdtemp(prefix="mm-test-lib-")
os.environ.setdefault("HF_HOME", tempfile.mkdtemp(prefix="mm-test-hf-"))
