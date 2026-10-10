# EDTH — contractul frontendului demonstrativ

Frontendul folosește JavaScript simplu și o hartă Cesium cu resurse servite local. Listele prezintă senzori, observații și verificarea umană a alertelor pe baza unor date fictive. `dist/data.js` este un adaptor asincron în memorie; nu creează o bază de date și nu conectează servicii externe. Reîncărcarea paginii sau resetarea demonstrației restabilește scenariul inițial.

## Limita de integrare

Echipa backend poate înlocui implementările din `dist/data.js`, păstrând exporturile și contractele de mai jos. Interfața nu trebuie să cunoască structura bazei de date sau protocoalele fiecărui furnizor. Corelarea datelor între senzori și estimările de clasificare sunt responsabilitatea serviciilor care furnizează datele.

```js
export const SENSOR_TYPES; // radar, acoustic, rf, eoir → { label, color }
export const ENTITY_TYPES; // uas, person, ugv, usv, unknown → { label, short, color }
export const STATUS_LABELS; // new, review, confirmed, closed → etichetă

export async function getSnapshot();
// → { sensors: Sensor[], observations: Observation[], events: Event[] }

export async function updateObservation(id, status, { role, reason });
// → Observation, sau Promise respinsă cu o eroare lizibilă

export async function resetDemo();
// → Snapshot inițial; operație exclusiv demonstrativă
```

### Senzor

| Câmp | Tip / semnificație |
| --- | --- |
| `id`, `name`, `vendor` | Șiruri; identificator stabil, nume și furnizor |
| `type` | `radar`, `acoustic`, `rf`, `eoir` |
| `status` | `online` sau `offline` |
| `x`, `y` | Numere; coordonate ale vechii scheme demonstrative 1200 × 850, neutilizate de Cesium |
| `lastSeen` | Dată ISO 8601 cu fus orar; ultima stare a senzorului |
| `description` | Text descriptiv simplu |

### Observație

| Câmp | Tip / semnificație |
| --- | --- |
| `id`, `name` | Șiruri; identificator stabil și nume |
| `type` | `uas`, `person`, `ugv`, `usv`, `unknown` |
| `status` | `new`, `review`, `confirmed`, `closed` |
| `x`, `y` | Numere; coordonate schematice fictive, neutilizate de Cesium |
| `confidence` | Număr între 0 și 100; valoare simulată în demonstrație |
| `firstSeen`, `lastSeen` | Date ISO 8601 cu fus orar; timpi ai observației |
| `sensorIds` | Listă de identificatori ai senzorilor sursă |
| `zone`, `description` | Texte simple pentru context |

O observație poate avea mai mulți senzori sursă. Identificatorii stabili trebuie păstrați la actualizare. În producție, backendul trebuie să definească sensul și proveniența nivelului de încredere; procentele demo nu reprezintă performanțe măsurate.

### Eveniment

| Câmp | Tip / semnificație |
| --- | --- |
| `id`, `title`, `description` | Șiruri; identificator, titlu și detalii |
| `time` | Dată ISO 8601 cu fus orar |
| `kind` | `info`, `warning` sau `success` |
| `observationId` | Identificator opțional al observației asociate |

Evenimentele sunt returnate în ordine cronologică inversă. Datele inițiale sunt fixate la 9 octombrie 2026, aproximativ ora 15:12 în București. Modificările efectuate în demonstrație primesc timpi simulați succesivi după acest moment; nu indică ora reală. Datele se afișează cu fusul `Europe/Bucharest`.

## Contractul cu serverul C2 (mod live)

Când `BACKEND_PORT` este setat, serverul local (`server-backend.mjs`) se conectează prin TCP la serverul C2 și face legătura cu pagina. Mesajele sunt obiecte JSON UTF-8 fără câmp de tip; sunt recunoscute după chei (`dist/backend-contract.js`).

| Mesaj | Direcție | Câmpuri | Ce face interfața |
| --- | --- | --- | --- |
| Threat | server → interfață | `threat_type`, `latitude_sensor`, `longitude_sensor`, `sensor_type`, `drone_type`, `top_interceptors[]` | Observație nouă `THR-nnn`, senzor pe hartă, eveniment în jurnal, lista de interceptoare propuse |
| MapPoint | server → interfață, continuu | `latitude`, `longitude` | Marcaj „Poziție server” cu urma ultimelor 300 de puncte |
| LoginRequest | interfață → server | `username`, `password` | Trimis din dialogul „Autentificare”; parola nu este păstrată sau jurnalizată |
| LoginResponse | server → interfață | `accepted` | Deblochează sau refuză sesiunea |
| Launch | interfață → server | `launch` (bool), `interceptor_name` | Trimis o singură dată, după confirmarea explicită a operatorului |

**Încadrarea pe TCP.** Serverul C2 nu definește încă un separator. Puntea extrage obiectele JSON din flux indiferent dacă vin lipite, separate prin linii sau tăiate între pachete, și ignoră octeții dintre ele. Interfața scrie fiecare mesaj urmat de `\n`. Un prefix binar de lungime nu este acceptat ca format; dacă îl adăugați, anunțați frontendul.

**Validare.** Un mesaj cu tip greșit, coordonate în afara intervalului WGS84, texte peste 200 de caractere sau mai mult de 10 interceptoare este respins în întregime și numărat în `ignored` (`GET /api/backend/status`), niciodată afișat parțial.

**Ce lipsește din contract și cum este tratat.** Threat nu are identificator, oră sau poziția țintei: ID-ul și ora sunt cele ale primirii în punte, iar poziția afișată este a senzorului. MapPoint nu are identificator, deci toate punctele formează o singură urmă, nelegată de o amenințare. Launch nu indică amenințarea vizată. LoginResponse nu transmite rolul. Evaluarea observației (verificare / confirmare / închidere) rămâne locală, fiindcă nu există mesaj pentru ea.

**Comanda de lansare.** Interfața o trimite numai dacă: rolul local este Operator, conexiunea este activă, serverul a acceptat autentificarea, iar `interceptor_name` se află în `top_interceptors` al acelei amenințări (verificat și în punte). Se trimite numai `launch: true`; sensul lui `false` nu este definit. Nu există confirmare de la server, așa că interfața afișează „comandă trimisă”, nu „lansat”. După o deconectare nu se retrimite nimic. Autorizarea reală (rolul `engager`) trebuie verificată de serverul C2.

## Evaluarea observațiilor

`updateObservation` permite trecerea din orice stare în `review`, `confirmed` sau `closed`. Redeschiderea unei observații se face prin `review`. Starea `new` este atribuită numai de scenariul inițial sau de sursa de date. O solicitare cu aceeași stare nu creează un eveniment suplimentar.

Închiderea necesită un motiv nenul, de cel mult 1.000 de caractere. Modificările păstrează timpii `firstSeen` și `lastSeen`, care descriu datele senzorilor, și adaugă un eveniment separat. Confirmarea se referă la evaluarea observației. Închiderea este o decizie de gestionare a alertei, nu o dovadă a unui rezultat fizic. Disponibilitatea senzorului și starea observației sunt independente.

Rolul `watcher` este doar pentru vizualizare. Rolul `operator` permite modificarea evaluării în demonstrație. Selectarea rolului în browser nu reprezintă autentificare sau acreditare și poate fi manipulată de utilizator.

Într-o integrare reală, backendul trebuie să determine identitatea și drepturile din sesiunea autentificată, să verifice acreditarea, aria de acces și autorizarea fiecărei cereri și să păstreze jurnalul de audit pe server. Nu trebuie să acorde acces pe baza câmpului `role` trimis de browser. Secretele și credențialele furnizorilor nu aparțin frontendului.

## Harta locală Cesium

Cesium este copiat în resursele statice locale prin `npm run prepare:cesium`. Fondul implicit este pachetul vectorial România, extras Geofabrik / OpenStreetMap, plus relieful Mapzen / Tilezen. Toate sunt servite din `dist/maps/` de pe aceeași origine. Browserul nu accesează baze de date și nu contactează furnizorii cartografici.

Pregătirea datelor este separată de frontendul de monitorizare: `scripts/prepare-romania.py` transformă arhiva MBTiles în pachete binare și indici XYZ, iar `scripts/prepare-terrain.py` pregătește relieful Terrarium. Fișierele generate pot fi copiate pe un server HTTP local. Detaliile, licențele și pașii sunt în [README.md](./README.md).

`dist/romania-map.js` decodează și rasterizează tile-uri vectoriale și încarcă volumele vizibile ale clădirilor. Acceptă pachetele inițiale gzip și formatele compacte Brotli / XZ, decodate cu un worker WASM local. Geometria de bază se oprește la nivelul 14 și este redesenată la apropiere. Înălțimile de 9 m sunt simbolice, nu valori măsurate. `dist/romania-terrain.js` citește imagini Terrarium PNG sau WebP lossless până la nivelul 11, conform manifestului, și subdivizează local aceste date pentru nivelurile vizuale mai apropiate, fără descărcări suplimentare. `dist/place-search.js` caută în catalogul local al localităților.

`createLocalMap` din `dist/cesium-map.js` expune `useRomania()`, `flyToPlace({lon, lat, height})`, `setMode('2d'|'3d')`, `home()`, `zoomIn()`, `zoomOut()`, `resize()` și `destroy()`. `setSource()` rămâne disponibil pentru surse raster proprii XYZ/TMS, validate de `dist/map-config.js` și servite de pe aceeași origine. Sursa raster Natural Earth este doar un exemplu cu rezoluție mică.

Google Maps și ATAK nu sunt integrate. Valorile `x` / `y` din `dist/data.js` provin dintr-o schemă fictivă și nu sunt latitudini, longitudini sau poziții reale. Ele nu sunt proiectate pe hartă. Cartografia și căutarea localităților nu folosesc senzorii sau observațiile demonstrative.

Aplicația funcționează fără internet când întregul director `dist/` pregătit este servit prin HTTP local (`npm run dev`). Varianta găzduită necesită acces la serverul gazdă. O pagină deschisă în browser nu constituie o instalare offline a întregului set de date.

## Actualizarea datelor

În scenariul demonstrativ nu există interogare periodică, flux de date în timp real, comandă către dispozitive sau garanție de sincronizare. Adaptorul furnizează copii ale stării interne, iar schimbările există numai în memoria paginii. Pentru date externe trebuie convenite erorile de autorizare, indisponibilitate și conflict, actualizarea după reconectare și tratamentul datelor învechite înainte de a afișa o stare de conectare reală.

Senzorii de tip diferit folosesc același contract de afișare; suportul demonstrativ pentru mai mulți furnizori nu implică existența unor integrări reale cu aceștia. În scenariul demonstrativ interfața nu trimite nicio comandă. În modul live, singura comandă este mesajul Launch descris mai sus, trimis după confirmarea operatorului.
