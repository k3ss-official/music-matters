# Shared Python resolution for start.sh, launcher.sh, and install-macos.sh.
# Order: conda env `music-matters` -> backend/.venv -> repo .venv -> system python3 (install only).

# Ensure Homebrew (Apple Silicon & Intel) and user-local bins are always on PATH,
# especially when launched from Finder / LaunchServices (.app bundle).
for _mm_dir in "/opt/homebrew/bin" "/opt/homebrew/sbin" "/usr/local/bin" "/usr/local/sbin" "$HOME/.local/bin"; do
    if [ -d "$_mm_dir" ] && [[ ":$PATH:" != *":$_mm_dir:"* ]]; then
        export PATH="$_mm_dir:$PATH"
    fi
done
unset _mm_dir

mm_find_conda() {
    local c
    for c in \
        "${CONDA_EXE:-}" \
        "$HOME/miniconda3/bin/conda" \
        "$HOME/miniforge3/bin/conda" \
        "$HOME/mambaforge/bin/conda" \
        "$HOME/anaconda3/bin/conda" \
        "/opt/homebrew/Caskroom/miniconda/base/bin/conda" \
        "/opt/homebrew/Caskroom/miniforge/base/bin/conda" \
        "/usr/local/Caskroom/miniconda/base/bin/conda" \
        "$(command -v conda 2>/dev/null || true)"; do
        if [ -n "$c" ] && [ -x "$c" ]; then
            echo "$c"
            return 0
        fi
    done
    return 1
}

mm_conda_env_python() {
    local conda_bin env_name="${1:-music-matters}" base py
    conda_bin="$(mm_find_conda)" || return 1
    base="$("$conda_bin" info --base 2>/dev/null)" || return 1
    py="$base/envs/$env_name/bin/python"
    if [ -x "$py" ]; then
        echo "$py"
        return 0
    fi
    return 1
}

# Echoes interpreter path for an existing project environment (no fallback to bare python3).
mm_find_python() {
    local repo="${1:?repo root required}"
    local py
    if py="$(mm_conda_env_python music-matters)"; then
        echo "$py"
        return 0
    fi
    if [ -x "$repo/backend/.venv/bin/python" ]; then
        echo "$repo/backend/.venv/bin/python"
        return 0
    fi
    if [ -x "$repo/.venv/bin/python" ]; then
        echo "$repo/.venv/bin/python"
        return 0
    fi
    return 1
}

# Sets MM_PYTHON; falls back to python3 on PATH (for dev / bootstrap).
mm_resolve_python() {
    local repo="${1:?repo root required}"
    if MM_PYTHON="$(mm_find_python "$repo")"; then
        export MM_PYTHON
        return 0
    fi
    MM_PYTHON="$(mm_find_system_python311 || command -v python3 || echo python3)"
    export MM_PYTHON
}

# Finds a system/Homebrew Python >= 3.11 for creating a fresh .venv.
mm_find_system_python311() {
    local cand
    for cand in \
        "/opt/homebrew/opt/python@3.11/bin/python3.11" \
        "/opt/homebrew/opt/python@3.12/bin/python3.12" \
        "/opt/homebrew/bin/python3.11" \
        "/opt/homebrew/bin/python3.12" \
        "/opt/homebrew/bin/python3" \
        "/usr/local/opt/python@3.11/bin/python3.11" \
        "/usr/local/opt/python@3.12/bin/python3.12" \
        "/usr/local/bin/python3.11" \
        "/usr/local/bin/python3.12" \
        "/usr/local/bin/python3" \
        "$(command -v python3.11 2>/dev/null || true)" \
        "$(command -v python3.12 2>/dev/null || true)" \
        "$(command -v python3 2>/dev/null || true)"; do
        if [ -n "$cand" ] && [ -x "$cand" ]; then
            if "$cand" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)' 2>/dev/null; then
                echo "$cand"
                return 0
            fi
        fi
    done
    return 1
}
