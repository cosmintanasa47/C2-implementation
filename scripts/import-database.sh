#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
container="${EDTH_SQL_CONTAINER:-sqlserver}"
docker cp "$project_dir/database/IMPORT_ALL.sql" "$container:/tmp/EDTH_IMPORT_ALL.sql"
# -I enables QUOTED_IDENTIFIER, needed by computed/filtered indexes.
# sqlcmd prompts for the SQL Server password; it is not placed in command history.
docker exec -it "$container" /opt/mssql-tools18/bin/sqlcmd \
    -S localhost -U "${EDTH_DB_USER:-sa}" -C -I -b -i /tmp/EDTH_IMPORT_ALL.sql
