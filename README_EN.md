# EDTH Hackathon: C2 implementation

## Starting on Linux Mint

1. Stop the old backend in Qt Creator, or with Ctrl+C in its terminal. Stop the old frontend too. Extract the archive into a new folder to avoid mixing up sources and builds.
2. The archive you received did not contain the local maps. Copy your `maps` folder into `frontend/dist/maps`. Do not replace the entire `dist` folder with an old version: you would lose the authentication changes.
3. Open a terminal in the folder that contains `database`, `EDTH_Hackathon`, `frontend`, `scripts` and this README.

SQL Server must be running in the `sqlserver` container, on port 1433. The commands below ask for the SQL Server password, NOT the web account password.

```bash
bash ./scripts/import-database.sh
bash ./scripts/run-backend.sh --check-db
bash ./scripts/run-backend.sh
```

The import uses the `Winner_Drone_Detectio_System` database. It creates the missing objects and imports the synthetic catalogs/sensors without deleting existing accounts. Do not run the old import variants separately afterwards. The `--check-db` diagnostic verifies the main authentication/history objects and the exact transfer of hex values into a temporary table; it does not create an account.

In another terminal, in the same folder:

```bash
bash ./scripts/run-frontend.sh
```

Open http://127.0.0.1:4173 and reload with Ctrl+Shift+R. Click Sign in → "Don't have an account? Create one". After creating the account, sign in. A new account receives the Viewer role only. The SQL snapshot and the sensors become available after authentication.

## Opening in Qt Creator

Open `EDTH_Hackathon/CMakeLists.txt`, choose the Desktop Qt 6 kit and build in a new folder. Run starts the TCP backend; the interface is in the browser. If the SQL password is missing from the process environment, a window appears for entering it. It is not saved in the sources. Do not start the backend from both Qt and the script at the same time: both use port 55067.

If the build dependencies are missing:

```bash
sudo apt update
sudo apt install build-essential cmake qt6-base-dev libqt6sql6-odbc libssl-dev octave octave-dev
```

Microsoft ODBC Driver 18 must be installed separately, as it already was on your computer. The frontend requires Node.js >=22; the script uses Node 22 through nvm if nvm is installed. The vendor files for serving the interface are included. For frontend tests/development: `cd frontend && npm ci && npm run check`.

## Configuration

Backend: `EDTH_DB_SERVER` (default `127.0.0.1,1433`), `EDTH_DB_NAME` (`Winner_Drone_Detectio_System`), `EDTH_DB_USER` (`sa`), `EDTH_DB_PASSWORD`, `EDTH_DB_DRIVER` (`ODBC Driver 18 for SQL Server`), `EDTH_DB_TRUST_CERTIFICATE` (`yes`), `EDTH_TCP_PORT` (`55067`). The password can be entered at startup. The local ODBC configuration keeps `Encrypt=no` from the provided code.

Frontend: `BACKEND_HOST`, `BACKEND_PORT` and optionally `TOMTOM_API_KEY`, in the environment or in `frontend/.env`. By default it connects to `127.0.0.1:55067`. The frontend's `.env` file does NOT automatically configure the Qt Creator environment. Without the TomTom key, the TomTom traffic layer is not available.

## Fixed issues

- Registration: I removed the ODBC binding of the salt/hash that caused the reported errors (`truncated`, and `image incompatible with varchar` when a QByteArray was used). The two internally generated values are strictly validated: exactly 64 hex characters. SQL Server converts the 32-byte binary literal to hex text. The username remains an SQL parameter. The values are neither truncated nor padded.
- The transaction reads the salt/hash back and checks exact equality before commit. The account and the Viewer role are confirmed together or cancelled together. The code remains compatible with the existing PBKDF2 authentication.
- The exact cause in the local Qt/ODBC/SQL Server combination was not reproduced here. This is an alternative insertion path, with verification, not a claim that varchar(64) would be insufficient for 64 ASCII characters.
- Connection, query and account-creation errors have distinct messages. A missing user is separated from an SQL error. The SQL details stay in the backend console, not in the browser.
- The default SQL password from the sources was removed. Starting without a password in terminal mode explains what needs to be configured. Starting from Qt Creator offers the password dialog.
- IMPORT_ALL includes the base schema, the authentication migration, the catalogs, the history and the verification of the authentication columns. It enables the SET options required by the SQL indexes. The migration only widens text columns that are too short; it does not shrink existing columns.
- The sensor type `eo_ir` is displayed as EO/IR; the SQL drone models are displayed, and the types `drona`, `uas`, `uav` are recognized. Old/future radar detections no longer mark a sensor as active. This indicator is not a physical connectivity test.
- Export supports observations without coordinates. The proximity analysis also recognizes the `uas` type.
- The archive does not contain old builds or the local Qt Creator settings. At startup the executable path is displayed, so you can identify which version you are using.

The risk layer remains off by default. The 50/100 m circles are configured proximity thresholds, not validated damage calculations. The prediction is a linear trend and requires at least 3 recent observations with distinct timestamps; data older than 120 s does not receive a current risk. No real engagement commands are implemented.

## Checks performed

- C++ build with GCC 13.3, Qt 6.4.2, OpenSSL and Octave 8.4, plus the build and tests with EDTH_WITH_OCTAVE=OFF.
- CTest: PBKDF2 against the reference vector, strict SQL hex validation, proximity analysis/prediction on a QThread (including expired observations).
- Frontend: 83 JavaScript tests passed, 1 skipped because the local Romania package is missing; 5 Python tests passed.
- TCP check of the Qt executable: missing password, JSON response for a missing SQL driver, occupied port and the exit code of the diagnostic.

I do not have access to the SQL Server container on your computer. The T-SQL import and the real registration must be validated there using the commands above; the frontend tests use a simulated TCP server.

For the C++ tests after the local build:

```bash
ctest --test-dir EDTH_Hackathon/build-local --output-on-failure
```
