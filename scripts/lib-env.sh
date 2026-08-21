# Shared environment helpers for start.sh and the macOS app launcher.
# Sourced, not executed.

mm_resolve_python() {
    # Sets MM_PYTHON to an executable. Prefers conda env music-matters, then
    # repo .venv / backend/.venv, else system python3.
    local repo="${1:-}"
    local conda_env="music-matters"
    MM_PYTHON="python3"

    if ! command -v conda &>/dev/null; then
        local c
        for c in \
            "$HOME/miniforge3/etc/profile.d/conda.sh" \
            "/opt/homebrew/Caskroom/miniforge/base/etc/profile.d/conda.sh" \
            "$HOME/miniconda3/etc/profile.d/conda.sh" \
            "$HOME/anaconda3/etc/profile.d/conda.sh"; do
            if [ -f "$c" ]; then
                # shellcheck disable=SC1090
                source "$c"
                break
            fi
        done
    fi

    if command -v conda &>/dev/null; then
        # shellcheck disable=SC1091
        source "$(conda info --base)/etc/profile.d/conda.sh"
        if conda activate "$conda_env" 2>/dev/null; then
            MM_PYTHON="python"
            return 0
        fi
    fi

    if [ -n "$repo" ] && [ -x "$repo/backend/.venv/bin/python" ]; then
        # shellcheck disable=SC1091
        source "$repo/backend/.venv/bin/activate"
        MM_PYTHON="python"
        return 0
    fi
    if [ -n "$repo" ] && [ -x "$repo/.venv/bin/python" ]; then
        # shellcheck disable=SC1091
        source "$repo/.venv/bin/activate"
        MM_PYTHON="python"
        return 0
    fi

    MM_PYTHON="python3"
}
