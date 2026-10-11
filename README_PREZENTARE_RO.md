# Prezentare cu date sintetice

Din EDTH-integrated/frontend ruleaza `npm run dev`, apoi deschide:
http://127.0.0.1:4173/presentation.html

Pagina principala are acum un link Demo in bara din stanga.
Daca Node ruleaza deja, opreste-l cu Ctrl+C si reporneste-l.

Demo-ul foloseste harta locala existenta din frontend/dist/maps si biblioteca Cesium existenta. Pastreaza folderul maps de pe calculator daca arhiva nu include datele tale complete. Nu necesita cheie TomTom, SQL, Qt sau autentificare.

- Drona rosie DEMO-TULCEA-01 urmeaza un circuit fictiv langa Tulcea.
- Sunt afisate 100 de pozitii anterioare simulate.
- Linia roz arata urmatoarele 30 de secunde ale scenariului prestabilit; nu este o predictie asupra unor observatii reale.
- Pauza, resetare, centrare si marirea hartii; Escape revine din modul marit.
- Panoul ramane vizibil in modul marit.
- Cercurile optionale 50/100 m sunt distante illustrative, nu estimari de daune.
- Engage afiseaza Engaging — simulation dupa confirmarea serverului Node. Acelasi mesaj apare in terminalul Node. Nu trimite mesaje catre Qt, SQL sau echipamente.

In aceasta pagina rolul este demonstrativ, separat de conturile Viewer/Engager din aplicatia principala. Datele SQL reale nu sunt importate in simulare.

Testare: `node --test tests/presentation.test.mjs` din frontend.
Verificate: modelul sintetic, ancorarea liniei roz, endpoint-ul demo si restrictia same-origin; verificare de sintaxa JavaScript. Randarea WebGL cu hartile de pe calculatorul utilizatorului nu a fost verificata aici.

Modificarile sunt limitate la frontend/server.mjs, frontend/dist/index.html si fisierele noi presentation*, server-presentation.mjs, tests/presentation.test.mjs si acest README. Restul arhivei este pastrat.
