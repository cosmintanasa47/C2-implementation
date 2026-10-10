# EDTH — frontend cu harta locală a României

Interfață JavaScript cu Cesium, cartografie pentru întreaga Românie în 2D și 3D, căutare locală de localități și panouri de monitorizare demonstrative. Nu include o bază de date sau servicii backend. Varianta locală de lucru folosește pachetele vectoriale inițiale și relieful PNG; compresia suplimentară și publicarea sunt amânate pentru etapa finală.

## Pornire din pachetul pregătit

```sh
npm run dev
```

Deschide [http://localhost:4173](http://localhost:4173). Serverul trebuie să rămână pornit. Aplicația și datele din `dist/` funcționează fără internet când sunt servite împreună de acest server local. Site-ul găzduit necesită acces la serverul său; încărcarea paginii o singură dată nu descarcă automat întreaga țară în browser.

## Reconstruire din surse

Sunt necesare Node.js, Python 3 cu Pillow (`python3 -m pip install Pillow`) și conexiune la internet pentru pregătirea inițială. Directorul `.cache/` păstrează descărcările, iar `dist/maps/` datele generate. Acestea sunt excluse din Git, dar sunt incluse în pachetul publicat.

```sh
npm ci
npm run prepare:cesium
npm run prepare:brotli
npm run prepare:xz
npm run prepare:romania
npm run prepare:terrain
npm run check
npm run dev
```

Consultă `--help` pentru opțiunile scripturilor Python. Manifestele rezultate în `dist/maps/` descriu sursa, întinderea, nivelurile și data pregătirii. Descărcarea și conversia se fac în etapa de pregătire; în browser se cer numai porțiunile vizibile. Nu există un serviciu SQLite în aplicația livrată.

## Compresie opțională pentru distribuția finală

Această etapă nu este necesară pentru lucrul local. Se rulează separat, când se stabilește găzduirea finală, cu directoare de destinație noi:

```sh
npm run compress:romania
npm run compress:xz
npm run compress:terrain
mv dist/maps/romania .cache/maps/romania-gzip
mv .cache/maps/romania-compressed-xz dist/maps/romania
mv dist/maps/terrain .cache/maps/terrain-png
mv .cache/maps/terrain-webp dist/maps/terrain
npm run check
```

Compresia produce mai întâi copii separate și verifică fiecare pachet înainte de înlocuire. Vectorii sunt împachetați inițial Brotli, apoi XZ, fără modificarea octeților MVT, iar relieful folosește WebP **lossless**, verificat pixel cu pixel față de PNG-ul pregătit. Compresia nu elimină localități, geometrii sau niveluri de detaliu. La actualizare, păstrează vechiul pachet separat până când noul manifest este complet și verificat.

## Ce oferă harta

- **2D:** localități, străzi și denumiri, apă, utilizarea terenurilor, contururi de clădiri și adrese unde există în OpenStreetMap.
- **3D:** aceleași date pe relieful local, plus volume de clădiri la apropiere. Contururile provin din OSM; **înălțimea de 9 m este convențională pentru toate clădirile**, deoarece pachetul Shortbread nu include înălțimi. Modelele nu sunt fotorealiste și nu reproduc înălțimi măsurate.
- **Căutare offline:** catalog de localități extras din datele OSM, cu diacritice opționale; localitățile omonime se disting prin coordonate.
- **Navigare:** 2D/3D păstrează zona, „Toată țara” revine la România, iar butoanele de oraș apropie harta. În 3D, Ctrl + tragere schimbă înclinarea.

Datele vectoriale sunt Geofabrik Shortbread 1.0, niveluri 0–14. La apropiere suplimentară sunt redesenate aceleași geometrii; nivelul vizual 19 nu înseamnă date sursă noi. Acoperirea și actualitatea diferă între localități. Numărul clădirilor 3D încărcate simultan este limitat pentru a proteja memoria browserului.

Relieful provine din Mapzen / Tilezen Terrain Tiles, niveluri 0–11. Pasul grilei la latitudinea României este aproximativ 53 m la nivelul maxim, iar valorile sunt rotunjite la metru pentru distribuție. La apropiere, Cesium subdivizează aceleași date de relief pentru a păstra rezoluția hărții stradale; subdivizarea nu adaugă măsurători. Rotunjirea la metru este precizia codării, nu o afirmație despre exactitatea măsurătorilor. Nu reprezintă un model de suprafață al clădirilor sau o actualizare topografică recentă.

## Date și licențe

- [Geofabrik România](https://download.geofabrik.de/europe/romania.html), [schema Shortbread 1.0](https://shortbread-tiles.org/schema/1.0/). © OpenStreetMap contributors, Geofabrik GmbH. Date sub [ODbL 1.0](https://www.openstreetmap.org/copyright).
- [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), [atribuiri complete Mapzen / Tilezen](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). Include EU-DEM, SRTM, GMTED și ETOPO1, conform surselor setului.
- Produced using Copernicus data and information funded by the European Union — EU-DEM layers.
- Documentație: [sursele și actualitatea reliefului](https://github.com/tilezen/joerd/blob/master/docs/data-sources.md), [format Terrarium](https://github.com/tilezen/joerd/blob/master/docs/formats.md).

Nu se descarcă în masă tile-uri de pe serviciul public `tile.openstreetmap.org`. Datele vin din extrasele destinate descărcării și din setul public de elevații AWS.

## Surse raster proprii

„Straturi locale” permite revenirea la pachetul România sau configurarea unui fond raster XYZ / TMS, EPSG:3857 / EPSG:4326, de pe aceeași origine. Exemplul Natural Earth inclus în Cesium rămâne disponibil ca sursă raster de rezoluție mică. Configurarea este în memoria paginii. `dist/map-config.js` validează acest format raster; harta vectorială implicită este implementată separat în `dist/romania-map.js`.

Pentru un server din LAN, expune resursele prin reverse proxy sub aceeași origine. Nu sunt necesare chei Google Maps sau Cesium ion. Google Maps și ATAK nu sunt integrate.

## Date și roluri demonstrative

`dist/data.js` păstrează senzorii și observațiile fictive numai în memoria paginii. Coordonatele schematice `x` / `y` nu sunt transformate în poziții geografice. Panourile demo sunt independente de cartografia reală.

Watcher consultă datele, Operator evaluează observații fictive. Selectorul nu reprezintă acreditare sau autentificare. Backendul trebuie să implementeze identitatea, autorizarea și auditul real. Nu există conexiune la senzori sau comandă către dispozitive. Contractul de integrare este în [INTEGRATION.md](./INTEGRATION.md).

## Resurse locale și verificare

Cesium este fixat la versiunea 1.146.0; rendererul folosește decoderul `decodeMVT` al acestei versiuni, un API intern care trebuie reverificat înainte de upgrade. `prepare:cesium` copiază Assets, Workers, ThirdParty, Widgets și licența. În copia generată, înlocuiește strict singura secvență `(0,eval)("this")` cu `globalThis`, verificând numărul potrivirilor. `node_modules` rămâne intact.

Sunt folosiți workeri module locali. Decodoarele Brotli 2.3.2 și XZ 0.2.3, cu modulele lor WASM, sunt copiate local prin `prepare:brotli` și `prepare:xz`; decomprimarea rulează într-un worker pentru a păstra interfața responsivă. Copia UMD XZ înlocuiește strict referința inițială `this` cu `globalThis` pentru importul ca modul. CSP limitează cererile la aceeași origine și permite compilarea WASM prin `wasm-unsafe-eval`, fără a permite evaluarea arbitrară JavaScript prin `unsafe-eval`. Cache-urile de tile-uri și geometrie au limite; lipsa unui pachet trebuie raportată în interfață.

`npm run check` verifică sintaxa, contractele raster, matematica tile-urilor, relieful și pregătirea datelor. Verificarea vizuală necesită un browser cu WebGL și accelerare hardware.

## Conectarea la serverul C2

Fără configurare, Monitorul afișează scenariul fictiv. Cu `BACKEND_PORT` în `.env` (și opțional `BACKEND_HOST`, implicit `127.0.0.1`), `npm run dev` deschide o conexiune TCP către serverul C2 și pagina trece în modul **LIVE**: lista, detaliile, jurnalul și harta se completează numai din mesajele serverului. Contractul mesajelor este în [INTEGRATION.md](./INTEGRATION.md).

```sh
# Terminal 1 — server C2 simulat (date inventate; login de test demo / demo):
npm run mock:backend
# Terminal 2 — interfața, legată la el:
BACKEND_PORT=5050 npm run dev
```

Un browser nu poate deschide un socket TCP, de aceea `server-backend.mjs` ține conexiunea și o expune paginii pe aceeași origine: `GET /api/backend/events` (Server-Sent Events), `POST /api/backend/login`, `POST /api/backend/launch`. Reconectarea se încearcă la 2 secunde; nimic nu este retrimis automat după reconectare.

## Straturi pe harta Monitor: trafic și activitate

În pagina principală, butonul **Straturi locale** de pe hartă deschide un meniu cu două straturi opționale, desenate pe aceeași hartă Cesium (2D și 3D, mulate pe relief; clădirile 3D rămân deasupra):

- **Trafic rutier** — TomTom live prin serverul local; apare numai dacă există `TOMTOM_API_KEY` în `.env`. Pagina nu primește cheia și CSP rămâne limitat la aceeași origine.
- **Persoane · activitate estimată** — modelul descris mai jos, cu zi și oră de previzualizare.

„Fond cartografic” din același meniu deschide dialogul existent pentru sursa raster. Straturile sunt legate în `dist/civil-overlays.js`, iar meniul este în `dist/monitor-overlays.js`. Pagina separată „Atlas civil” a fost eliminată.

### Activitate estimată

Stratul „Activitate estimată” colorează zonele în verde / galben / roșu după cât de active sunt, probabil, locurile cartate la ora respectivă. Este un **model al aplicației, nu o măsurătoare**: nu numără persoane și nu folosește date de telefonie mobilă.

- **Locuri:** `npm run prepare:activity` citește straturile `pois` și `public_transport` din pachetele locale Shortbread (nivelul 14) și adună circa 260.000 de locuri în celule de nivel 16 (aproximativ 430 m), pe zece grupe: restaurante, baruri, magazine, școli, instituții, sănătate, stații, agrement, cazare, cult. Rezultatul este `dist/civil-data/activity-cells.bin` cu manifestul `activity.json`. Mobilierul stradal (bănci, coșuri, bancomate) și elementele private (piscine) sunt excluse.
- **Ponderi și curbe orare:** fiecare tip de loc are o pondere fixă (`scripts/prepare-civil-activity.mjs`), iar fiecare grupă are o curbă pe ore pentru luni–joi, vineri, sâmbătă și duminică (`dist/civil-activity-model.js`), aplicată în ora României. Toate sunt ipoteze de lucru; sărbătorile, evenimentele și vremea nu sunt modelate.
- **Culori:** puncte de model pe km²: verde sub 100, galben 100–sub 400, roșu cel puțin 400. La micșorarea hărții, o celulă mare folosește media ponderată cu activitatea a celulelor fine, pentru ca un oraș să nu fie diluat de câmpurile din jur. Celulele fără locuri cartate rămân necolorate.
- **Componenta live:** când stratul de trafic TomTom este activ, încetinirea măsurată (1 − viteza relativă, ponderată cu lungimea drumurilor) din tile-urile deja descărcate înmulțește estimarea cu cel mult 2. Drumurile libere nu o scad, măsurătorile mai vechi de 5 minute sunt ignorate, iar fără trafic stratul rămâne doar model orar. Nu se fac cereri suplimentare către TomTom.
- **Previzualizare:** ziua și ora pot fi schimbate din panou pentru a vedea modelul în alt moment, fără trafic live; „Revino la ora actuală” reia ceasul.

Acoperirea depinde de cât de complet este cartată o localitate în OpenStreetMap.

### Conectarea traficului rutier

Este nevoie de o cheie TomTom cu acces la **Traffic API Orbis v2** ([developer.tomtom.com](https://developer.tomtom.com/user/me/apps)); planul gratuit nu cere card.

Copiază `.env.example` în `.env`, completează `TOMTOM_API_KEY=` și repornește serverul. Serverul acceptă fișierul din `frontend/.env` sau din directorul părinte al proiectului (`../.env`); o variabilă de mediu are prioritate. `server.mjs` citește cheia la pornire, iar `server-traffic.mjs` retransmite tile-urile de trafic prin `/api/civil/traffic/flow/{z}/{x}/{y}`. Pagina întreabă `/api/civil/config` și află doar dacă există o cheie; cheia nu ajunge în browser, nu apare în URL-uri sau jurnale. `.env` este exclus din Git și se află în afara `dist/`, deci nu este servit sau publicat. Serverul ascultă numai pe `127.0.0.1` și refuză cererile venite de pe alte site-uri. Pe găzduire statică, fără acest server, stratul de trafic nu este disponibil.

Cotele se consumă din contul TomTom: fiecare tile vizibil este cerut din nou la fiecare actualizare.

`dist/civil-traffic.js` decodează tile-uri MVT de trafic folosind Cesium 1.146.0 și desenează poliliniile pe un strat transparent în 2D/3D. Paleta are trei praguri proprii de afișare pentru `relative_speed` (viteza actuală / viteza de circulație liberă):

- Verde `≥0.75`: destul de liber.
- Galben `≥0.40` și `<0.75`: aglomerare medie.
- Roșu `<0.40`: foarte aglomerat.
- Drum închis: gri întrerupt; viteză absentă/invalidă: fără culoare, niciodată verde implicit.

Actualizarea este la 60 s cât stratul și pagina sunt vizibile. „Primit la” indică descărcarea în browser, nu ora observației TomTom. Dezactivarea oprește cererile; o eroare oprește fluxul și permite reîncercarea explicită. Nu sunt conectate incidentele rutiere. Geometriile TomTom pot diferi de fondul OSM local. Browserul nu contactează TomTom direct: CSP rămâne limitat la aceeași origine.

Documentație: [TomTom Vector Flow Tiles Orbis v2](https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-flow/vector-flow-tiles). Adresa, antetele și câmpurile au fost comparate cu documentația la 10 octombrie 2026, iar afișarea a fost verificată cu o cheie reală peste București. Testele automate folosesc răspunsuri controlate; nu reprezintă date rutiere reale.
