# Lettore PDF fluido — Specifica e analisi tecnica

Versione: 0.1  
Data: 19 ottobre 2026  
Stato: DA APPROVARE  
Metodo: spec-driven development

## 1. Obiettivo e processo

Realizzare un lettore PDF leggero e open source per desktop, tablet e smartphone. Il documento originale rimane invariato; note, evidenziazioni e posizione di lettura sono portabili separatamente.

Questa specifica descrive requisiti, proposta tecnica e criteri verificabili. Non è un piano di implementazione e non documenta prove tecniche già eseguite.

Gate:

1. Revisione e approvazione esplicita di questa analisi.
2. Solo dopo approvazione: redazione del piano, con attività e test tracciati ai requisiti.
3. Implementazione subordinata al processo di approvazione successivo; variazioni dei requisiti aggiornano prima la specifica.

## 2. Decisioni confermate

- Lettura fluida con scorrimento continuo, non sfogliamento obbligatorio.
- Font regolabile, evidenziazioni e note.
- Immagini integrate e ingrandibili già nel primo rilascio.
- Ripresa automatica del punto di lettura alla riapertura.
- Nessuna modifica al PDF originale.
- File separato per portare i dati su un altro dispositivo.
- Documenti locali nel primo rilascio; Drive e OneDrive in seguito.
- Nessuna sincronizzazione automatica tra dispositivi nel primo rilascio.
- Utilizzo su desktop, tablet e cellulari.

## 3. Proposte da approvare

- Un unico file JSON associato per evidenziazioni, note e stato del documento.
- File associato come fonte persistente principale, aggiornato automaticamente.
- Cache locale utilizzata come copia di lavoro/recupero, non come sostituto silenzioso del file.
- Modalità con esportazione manuale solo come alternativa ridotta esplicitamente approvata.
- Supporto iniziale focalizzato sui PDF con testo selezionabile e layout semplice.
- Vista originale complementare alla vista fluida.
- Regolazione di interlinea e larghezza della colonna oltre alla dimensione del font.

## 4. Perimetro

### Incluso

Apertura locale, ricostruzione del testo, vista originale, lettura continua, immagini con zoom, annotazioni testuali, note, persistenza separata, ripresa e trasferimento manuale tra dispositivi.

### Escluso

OCR, garanzia di ricostruzione fedele di layout arbitrari, formule e tabelle complesse, annotazioni grafiche sulle figure, sincronizzazione, account, backend applicativo, fusione automatica dei conflitti, provider cloud e modalità a schermate ebook.

## 5. Requisiti

| ID    | Descrizione                                                           |
| ----- | --------------------------------------------------------------------- |
| RF-01 | Aprire PDF locali e preservarne i byte originali.                     |
| RF-02 | Mostrare vista fluida e originale.                                    |
| RF-03 | Regolare la lettura mantenendo il passaggio corrente.                 |
| RF-04 | Scorrere continuamente con riferimenti alle pagine PDF.               |
| RF-05 | Visualizzare immagini nel flusso e ingrandirle.                       |
| RF-06 | Evidenziare testo e collegare note ai passaggi.                       |
| RF-07 | Salvare automaticamente in file associato.                            |
| RF-08 | Ripristinare il punto alla riapertura.                                |
| RF-09 | Trasferire i dati copiando PDF e file associato.                      |
| RF-10 | Gestire errori e ambiguità senza perdita o sovrascrittura silenziosa. |

## 6. Architettura candidata

### Nucleo condiviso

Proposta: TypeScript, PDF.js come candidato per estrazione/rendering, frontend responsive; Svelte è un'opzione non vincolante.

Moduli:

- DocumentReader: lettura del PDF originale.
- ContentExtractor: testo, geometrie e riferimenti grafici.
- ReadingModelBuilder: titoli, paragrafi e figure con provenienza nelle pagine.
- AnchorResolver: ancoraggio di note, evidenziazioni e posizione.
- AnnotationStore: operazioni sui dati utente.
- DocumentStateStore: validazione, versionamento e persistenza.
- StorageAdapter: apertura e salvataggio specifici della piattaforma.
- UI: lettura, originale, pannello note e visualizzatore immagini.

Separare lo storage dal motore per aggiungere successivamente provider cloud senza riscrivere il nucleo.

### Alternativa A: PWA local-first

Candidata per prototipo e distribuzione web. Non presumere che tutti i browser consentano lo stesso ciclo di apertura e aggiornamento automatico del file esterno. Cache browser più esportazione esplicita non equivalgono al requisito primario.

### Alternativa B: Tauri 2

Frontend e motore condivisi, contenitore applicativo e integrazioni native per i file. Anche questa alternativa richiede verifica di autorizzazioni, apertura, scrittura e riapertura, soprattutto su mobile.

La preferenza iniziale per la PWA resta subordinata al requisito del file aggiornato automaticamente. Nessuna scelta finale è già approvata. Compatibilità effettiva e licenze devono essere verificate sulle versioni selezionate.

## 7. Lettura e navigazione

Il contenuto fluido è una sequenza di blocchi. Ogni blocco conserva pagina originale ed eventuali geometrie; un paragrafo può comprendere segmenti di più pagine.

- Scorrimento verticale senza cambio pagina obbligatorio.
- Numero di pagina originale corrente nell'interfaccia.
- Separatore pagina discreto e disattivabile: proposta UI.
- “Vai a pagina” porta al primo contenuto disponibile della pagina richiesta.
- Indice utilizzabile quando disponibile; generazione automatica non richiesta.
- Fusione dei paragrafi tra pagine solo se sufficientemente affidabile; altrimenti blocchi distinti.
- Vista originale aperta sulla pagina corrispondente; ritorno alla precedente ancora fluida.

La regola per identificare la pagina corrente nella viewport deve essere univoca e documentata.

## 8. Immagini

Una figura conserva ID, pagina, regione di origine e didascalia eventuale. Sistema di coordinate e rotazioni devono essere definiti.

- Adattamento alla colonna con proporzioni conservate.
- Apertura a schermo intero con clic o tocco.
- Pinch-to-zoom su touch e controlli dedicati su desktop.
- Spostamento dell'immagine ingrandita e adattamento allo schermo.
- Chiusura con ritorno al punto precedente.
- Risorsa estratta o regione della pagina renderizzata, secondo la strategia del motore.
- Figure composte gestibili come ritagli della pagina.
- Didascalie associate quando riconoscibili, altrimenti mantenute come testo.
- Se il posizionamento è incerto, figura a fine contenuto della pagina con richiamo all'originale.
- Risoluzione maggiore prodotta su richiesta, senza ricostruire dettagli assenti dalla sorgente.

Il riconoscimento automatico delle figure è un rischio da verificare; non si promette copertura universale. Le immagini non vengono duplicate nel file dati: il PDF è la sorgente.

## 9. File associato e persistenza

Convenzione proposta:

```text
documento.pdf
documento.annotations.json
```

Identità tramite hash SHA-256 dei byte del PDF, non nome o percorso. Se cambiano i byte, il documento è considerato diverso; migrazione automatica esclusa dal primo rilascio.

Contenuto del file JSON:

- versione dello schema;
- hash e nome indicativo del PDF;
- versione della normalizzazione del testo;
- evidenziazioni e note con identificativi;
- punto di lettura e modalità utilizzata;
- eventuali preferenze del documento approvate;
- metadati per revisione e recupero.

Non inserire percorsi assoluti, handle, autorizzazioni, cache o immagini renderizzate. Distinguere preferenze globali dell'app e stato del documento.

### Ciclo di salvataggio

1. Selezionare o creare il file associato e verificare l'hash.
2. Aggiornare automaticamente con scritture raggruppate.
3. Limite proposto da approvare: avvio della persistenza entro 2 secondi dall'ultima modifica o dall'arresto dello scorrimento, in condizioni ordinarie con accesso disponibile.
4. Non affidarsi soltanto all'evento di chiusura.
5. Mostrare: modifiche in attesa, salvataggio in corso, salvato, errore.
6. Dichiarare salvato soltanto dopo conferma di scrittura dell'adattatore.
7. In caso di errore, mantenere la copia di lavoro e offrire recupero/esportazione.

Definire una strategia di scrittura recuperabile per piattaforma, preferendo sostituzione atomica quando disponibile. Una chiusura forzata può perdere modifiche non ancora persistite: non promettere garanzie assolute.

La cache non sostituisce il file. Eventuali divergenze devono essere rilevate e gestite esplicitamente. Modalità manuale con esportazione solo se approvata come capacità ridotta e comunicata prima dell'uso.

### Trasferimento

Copia manuale di PDF e file dati aggiornato. Sul dispositivo di destinazione, selezione dei file e verifica dell'identità. Nessuna fusione automatica di copie divergenti. Se rilevata una revisione esterna diversa, non sovrascriverla silenziosamente.

## 10. Ancoraggio e ripristino

Ancora testuale: pagina, offset nel testo normalizzato, citazione esatta, contesto precedente/successivo ed eventuali geometrie. Normalizzazione e convenzione degli offset devono essere documentate e versionate. I soli ID dei blocchi non garantiscono stabilità tra versioni del motore.

Risoluzione:

1. Verifica posizione e citazione.
2. Ricerca tramite citazione e contesto se necessario.
3. Se ambiguo, annotazione conservata come non risolta, senza aggancio arbitrario.

Il punto di lettura usa ancora testuale o di figura e posizione relativa nella viewport. Nella vista originale conserva pagina e posizione interna. Cambiando font o dispositivo si conserva il contenuto, non il numero di pixel.

Se la risoluzione precisa fallisce, ripristinare la pagina salvata e segnalare l'approssimazione. Se la chiusura avviene durante lo zoom, riaprire sulla figura nel flusso, non automaticamente nel visualizzatore.

## 11. Criteri di accettazione

Applicabili sulle piattaforme approvate e sui casi dichiarati supportati del corpus.

| ID    | Requisito   | Scenario e risultato atteso                                                                                             |
| ----- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| AC-01 | RF-01       | PDF locale consultabile senza invio del contenuto a un backend applicativo.                                             |
| AC-02 | RF-01       | Dopo lettura, annotazione e salvataggio, hash del PDF originale invariato.                                              |
| AC-03 | RF-02       | PDF testuale semplice del corpus: ordine corretto, nessuna omissione significativa.                                     |
| AC-04 | RF-03       | Font/interlinea/larghezza modificabili senza sovrapposizioni e mantenendo il passaggio.                                 |
| AC-05 | RF-04       | Confine pagina superato con scorrimento continuo e provenienza preservata.                                              |
| AC-06 | RF-04       | Vai a pagina raggiunge il contenuto richiesto; input non valido gestito senza perdita stato.                            |
| AC-07 | RF-02       | Cambio vista coerente con la pagina corrente e ritorno alla precedente ancora fluida.                                   |
| AC-08 | RF-05       | Figura supportata visibile nel flusso, proporzioni corrette e didascalia quando riconosciuta.                           |
| AC-09 | RF-05       | Zoom, spostamento e adattamento utilizzabili su desktop e touch.                                                        |
| AC-10 | RF-05       | Chiusura visualizzatore riporta alla figura e al punto precedente.                                                      |
| AC-11 | RF-05       | Collocazione incerta: fallback nella pagina d'origine, senza omissione silenziosa nei casi supportati.                  |
| AC-12 | RF-06       | Evidenziazione e nota recuperate dopo conferma salvataggio e riapertura.                                                |
| AC-13 | RF-06       | Dopo cambio font, evidenziazione ancora sul medesimo testo.                                                             |
| AC-14 | RF-06       | Note accessibili su desktop e telefono con colonna o pannello adattivo.                                                 |
| AC-15 | RF-07       | File associato creato separatamente, valido, con schema e identità corretti.                                            |
| AC-16 | RF-07       | Persistenza avviata nel limite approvato; salvato indicato solo dopo scrittura confermata.                              |
| AC-17 | RF-10       | Scrittura fallita: avviso visibile, dati di lavoro conservati, nessuna falsa conferma.                                  |
| AC-18 | RF-08       | Chiusura dopo salvataggio e riapertura: note e stesso passaggio visibile ripristinati.                                  |
| AC-19 | RF-10       | Chiusura forzata durante scrittura: nessuna corruzione silenziosa, recupero ultima versione valida.                     |
| AC-20 | RF-09       | PDF rinominato/spostato riconosciuto tramite hash.                                                                      |
| AC-21 | RF-10       | File dati di PDF diverso respinto con avviso, nessuna applicazione automatica.                                          |
| AC-22 | RF-09       | Coppia di file su altro dispositivo: note, evidenziazioni e punto ripristinati con viewport/font diversi.               |
| AC-23 | RF-07       | File dati assente: scelta esplicita di cercarlo o crearne uno, nessuna falsa promessa di recupero.                      |
| AC-24 | RF-10       | File dati invalido/schema non supportato: errore comprensibile e nessuna distruzione dell'originale.                    |
| AC-25 | RF-10       | Ancora ambigua: nota conservata come non risolta, nessun aggancio arbitrario.                                           |
| AC-26 | RF-08       | Punto preciso non risolvibile: pagina salvata aperta con avviso di approssimazione.                                     |
| AC-27 | RF-04       | Caricamento di blocchi/immagini vicini non sposta il passaggio corrente.                                                |
| AC-28 | RF-10       | Scansione senza testo: limite spiegato e originale consultabile, nessuna promessa OCR.                                  |
| AC-29 | RF-10       | Revisione esterna divergente rilevata: scelta esplicita o blocco, nessuna sovrascrittura silenziosa.                    |
| AC-30 | RF-07       | Piattaforma senza scrittura automatica: limite dichiarato prima dell'uso e alternativa non presentata come equivalente. |
| AC-31 | RF-09       | Nessuna sincronizzazione automatica; trasferimento tramite copia esplicita.                                             |
| AC-32 | Trasversale | Codice e istruzioni build disponibili; licenza scelta e compatibilità dipendenze verificata.                            |

## 12. Verifica e requisiti non funzionali

Corpus riproducibile con documenti utilizzabili legalmente:

- testo a colonna singola;
- paragrafi tra pagine, intestazioni e piè di pagina;
- immagini raster con didascalie;
- figure vettoriali e composte;
- pagine ruotate;
- due colonne, tabelle e formule per delimitare supporto e fallback;
- scansioni;
- documento lungo;
- file dati invalidi, hash differenti e ancore ambigue.

Registrare per ogni caso aspettative, piattaforma, versione del motore ed esito. Presenza nel corpus non significa supporto completo del layout.

Misurare prima lettura, memoria, fluidità, dimensione app e latenza salvataggio. Le soglie non sono ancora approvate: “leggero” è un obiettivo da rendere quantitativo.

Proposta di caricamento: elaborazione progressiva della zona visibile e delle pagine vicine, immagini ad alta risoluzione su richiesta e stabilizzazione dell'ancora durante il caricamento.

## 13. Decisioni aperte

1. Sistemi, versioni e browser/contenitori target.
2. Obbligo di file aggiornato automaticamente su tutte le piattaforme ed eventuali eccezioni.
3. Scelta PWA/Tauri dopo verifica del ciclo di apertura, autorizzazioni, scrittura e riapertura.
4. Conferma del file unico per annotazioni e posizione.
5. Copertura delle figure e limiti per layout complessi.
6. Corpus, dispositivi e soglie prestazionali.
7. Preferenze portabili del documento rispetto a quelle globali.
8. Licenza open source del progetto.
9. Conferma o modifica del limite proposto di 2 secondi per avviare la persistenza.

## 14. Approvazione

- [ ] Approvata senza modifiche.
- [ ] Approvata con modifiche da recepire nella revisione successiva.
- [ ] Da rivedere.

Le decisioni aperte devono essere risolte o demandate esplicitamente con vincoli chiari. Dopo approvazione si prepara il piano, non si avvia automaticamente lo sviluppo.

## 15. Provenienza e limiti

Documento derivato dalla conversazione del 19 ottobre 2026. Le scelte tecniche sono proposte: non sono benchmark, certificazioni di compatibilità o risultati di prove già eseguite. Nessuna nuova verifica esterna di API/librerie è stata svolta per questa redazione. Compatibilità e fattibilità richiedono validazione sulle piattaforme approvate.
