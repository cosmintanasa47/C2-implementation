# EDTH — versiune corectată

## Pornire pe Linux Mint

1. Oprește backendul vechi în Qt Creator sau cu Ctrl+C în terminalul lui. Oprește și frontendul vechi. Extrage arhiva într-un folder nou, pentru a evita amestecarea surselor și buildurilor.
2. Arhiva primită nu conținea hărțile locale. Copiază folderul tău `maps` în `frontend/dist/maps`. Nu înlocui întregul `dist` cu o versiune veche: ai pierde modificările de autentificare.
3. Deschide un terminal în folderul care conține `database`, `EDTH_Hackathon`, `frontend`, `scripts` și acest README.

SQL Server trebuie să ruleze în containerul `sqlserver`, pe portul 1433. Comenzile de mai jos cer parola SQL Server, NU parola contului web.

```bash
bash ./scripts/import-database.sh
bash ./scripts/run-backend.sh --check-db
bash ./scripts/run-backend.sh
```

Importul folosește baza `Winner_Drone_Detectio_System`. Creează obiectele lipsă și importă cataloagele/senzorii sintetici fără a șterge conturile existente. Nu rula apoi separat variantele vechi de import. Diagnosticul `--check-db` verifică principalele obiecte de autentificare/istoric și transferul exact al valorilor hex într-un tabel temporar; nu creează un cont.

În alt terminal, în același folder:

```bash
bash ./scripts/run-frontend.sh
```

Deschide http://127.0.0.1:4173 și reîncarcă folosind Ctrl+Shift+R. Apasă Autentificare → „Nu ai cont? Creează unul”. După creare, autentifică-te. Un cont nou primește numai Viewer. Snapshotul SQL și senzorii devin disponibili după autentificare.

## Deschidere în Qt Creator

Deschide `EDTH_Hackathon/CMakeLists.txt`, alege kitul Desktop Qt 6 și construiește într-un folder nou. Run pornește backendul TCP; interfața este în browser. Dacă lipsește parola SQL din mediul procesului, apare o fereastră pentru introducerea ei. Nu o salvează în surse. Nu porni simultan backendul din Qt și din script: ambele folosesc portul 55067.

Dacă dependențele de compilare lipsesc:

```bash
sudo apt update
sudo apt install build-essential cmake qt6-base-dev libqt6sql6-odbc libssl-dev octave octave-dev
```

Driverul Microsoft ODBC Driver 18 trebuie să fie instalat separat, cum era deja pe calculatorul tău. Frontendul necesită Node.js >=22; scriptul folosește Node 22 prin nvm dacă nvm este instalat. Fișierele vendor pentru servirea interfeței sunt incluse. Pentru testele/dezvoltarea frontendului: `cd frontend && npm ci && npm run check`.

## Configurare

Backend: `EDTH_DB_SERVER` (implicit `127.0.0.1,1433`), `EDTH_DB_NAME` (`Winner_Drone_Detectio_System`), `EDTH_DB_USER` (`sa`), `EDTH_DB_PASSWORD`, `EDTH_DB_DRIVER` (`ODBC Driver 18 for SQL Server`), `EDTH_DB_TRUST_CERTIFICATE` (`yes`), `EDTH_TCP_PORT` (`55067`). Parola se poate introduce la pornire. Configurarea locală ODBC păstrează `Encrypt=no` din codul furnizat.

Frontend: `BACKEND_HOST`, `BACKEND_PORT` și opțional `TOMTOM_API_KEY`, în mediu sau `frontend/.env`. Implicit conectează `127.0.0.1:55067`. Fișierul `.env` al frontendului NU configurează automat mediul Qt Creator. Fără cheia TomTom, stratul de trafic TomTom nu este disponibil.

## Probleme corectate

- Înregistrarea: am eliminat bindingul ODBC al saltului/hashului care producea erorile raportate (`truncated`, respectiv `image incompatible with varchar` când se folosea QByteArray). Cele două valori generate intern sunt validate strict: exact 64 caractere hex. SQL Server convertește literalul binar de 32 octeți la text hex. Username-ul rămâne parametru SQL. Nu se scurtează și nu se completează valorile.
- Tranzacția citește înapoi saltul/hashul și verifică egalitatea exactă înainte de commit. Contul și rolul Viewer se confirmă împreună sau se anulează împreună. Codul rămâne compatibil cu autentificarea PBKDF2 existentă.
- Cauza exactă din combinația locală Qt/ODBC/SQL Server nu a fost reprodusă aici. Aceasta este o cale alternativă de inserare, cu verificare, nu o afirmație că varchar(64) ar fi insuficient pentru 64 caractere ASCII.
- Erorile de conectare, interogare și creare cont au mesaje distincte. Lipsa unui utilizator se separă de o eroare SQL. Detaliile SQL rămân în consola backendului, nu în browser.
- Parola SQL implicită din surse a fost eliminată. Pornirea fără parolă în modul terminal explică ce trebuie configurat. Pornirea din Qt Creator oferă dialogul de parolă.
- IMPORT_ALL include schema de bază, migrarea de autentificare, cataloagele, istoricul și verificarea coloanelor de autentificare. Activează opțiunile SET cerute de indexurile SQL. Migrarea lărgește doar coloanele text prea scurte; nu micșorează coloanele existente.
- Tipul de senzor `eo_ir` se afișează ca EO/IR; modelele de drone SQL sunt afișate, iar tipurile `drona`, `uas`, `uav` sunt recunoscute. Detecțiile radar vechi/viitoare nu mai marchează un senzor ca activ. Acest indicator nu este un test de conectivitate fizică.
- Exportul suportă observații fără coordonate. Analiza de proximitate recunoaște și tipul `uas`.
- Arhiva nu conține builduri vechi sau setările locale Qt Creator. La pornire se afișează calea executabilului, ca să poți identifica versiunea folosită.

Stratul de risc rămâne implicit oprit. Cercurile 50/100 m sunt praguri de proximitate configurate, nu calcule validate ale pagubelor. Predicția este un trend liniar și necesită cel puțin 3 observații recente cu timpi diferiți; datele mai vechi de 120 s nu primesc risc actual. Nu sunt implementate comenzi reale de angajare.

## Verificări efectuate

- Compilare C++ cu GCC 13.3, Qt 6.4.2, OpenSSL și Octave 8.4, plus compilarea și testele cu EDTH_WITH_OCTAVE=OFF.
- CTest: PBKDF2 față de vectorul de referință, validarea strictă hex SQL, analiza de proximitate/predicție pe un QThread (inclusiv observații expirate).
- Frontend: 83 teste JavaScript trecute, 1 omis deoarece lipsește pachetul local România; 5 teste Python trecute.
- Verificare TCP a executabilului Qt: lipsa parolei, răspunsul JSON la driver SQL lipsă, port ocupat și codul de ieșire al diagnosticului.

Nu am acces la containerul SQL Server de pe calculatorul tău. Importul T-SQL și înregistrarea reală trebuie validate acolo prin comenzile de mai sus; testele frontendului folosesc un server TCP simulat.

Pentru testele C++ după compilarea locală:

```bash
ctest --test-dir EDTH_Hackathon/build-local --output-on-failure
```
