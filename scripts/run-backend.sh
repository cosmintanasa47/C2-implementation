#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export EDTH_DB_SERVER="${EDTH_DB_SERVER:-127.0.0.1,1433}"
export EDTH_DB_NAME="${EDTH_DB_NAME:-Winner_Drone_Detectio_System}"
export EDTH_DB_USER="${EDTH_DB_USER:-sa}"
export EDTH_DB_DRIVER="${EDTH_DB_DRIVER:-ODBC Driver 18 for SQL Server}"
export EDTH_DB_TRUST_CERTIFICATE="${EDTH_DB_TRUST_CERTIFICATE:-yes}"
if [[ -z "${EDTH_DB_PASSWORD:-}" ]]; then
    read -r -s -p 'Parola SQL Server: ' EDTH_DB_PASSWORD
    printf '\n'
    export EDTH_DB_PASSWORD
fi
cmake -S "$project_dir/EDTH_Hackathon" -B "$project_dir/EDTH_Hackathon/build-local" \
    -DEDTH_WITH_OCTAVE="${EDTH_WITH_OCTAVE:-ON}"
cmake --build "$project_dir/EDTH_Hackathon/build-local" --parallel 2
exec "$project_dir/EDTH_Hackathon/build-local/EDTH_Hackathon" --headless "$@"
