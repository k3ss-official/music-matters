#!/usr/bin/env bash
# Install this repo as a Hermes Bot Mode profile.
# Docs: https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
YAML="$ROOT/.hermes/bot.yaml"
SOUL="$ROOT/.hermes/SOUL.md"

if [[ ! -f "$YAML" ]]; then
  echo "missing $YAML" >&2
  exit 1
fi

NAME="$(awk '/^name:/{print $2; exit}' "$YAML" | tr -d '"' | tr -d "'")"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
DEST="$HERMES_HOME/profiles/$NAME"

mkdir -p "$DEST/skills" "$DEST/memories"
cp "$YAML" "$DEST/bot.yaml"
if [[ -f "$SOUL" ]]; then
  cp "$SOUL" "$DEST/SOUL.md"
fi
if [[ -d "$ROOT/.hermes/skills" ]]; then
  cp -R "$ROOT/.hermes/skills/." "$DEST/skills/"
fi
if [[ -f "$ROOT/.hermes/routines.yaml" ]]; then
  cp "$ROOT/.hermes/routines.yaml" "$DEST/routines.yaml"
fi

# Project-local skills are also discovered at <repo>/.hermes/skills when cwd is the repo.
echo "Installed Hermes bot '$NAME'"
echo "  profile: $DEST"
echo "  chat:    hermes -p $NAME chat"
echo "  cron:    hermes cron list    # namespaced [bot:$NAME]"
echo
echo "Desktop: Bots tab → the profile is on this machine. @${NAME} from any chat."
if [[ ! -x "$(command -v hermes || true)" ]]; then
  echo
  echo "Hermes CLI not on PATH. Install:"
  echo "  curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash"
fi
