#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]]; then
    source "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
    nvm use 22 >/dev/null
fi
if ! command -v node >/dev/null || ! node -e 'if(Number(process.versions.node.split(".")[0])<22)process.exit(1)'; then
    echo 'Este necesar Node.js 22 sau mai nou.' >&2
    exit 1
fi
cd "$project_dir/frontend"
exec npm run dev
