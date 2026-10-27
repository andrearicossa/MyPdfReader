/**
 * Lettura dell'indice (segnalibri) del PDF, appiattita in voci navigabili.
 * Le destinazioni non valide non eliminano il documento: la voce viene
 * conservata come intestazione di gruppo se ha figli utili, altrimenti scartata.
 * I collegamenti URL esterni non vengono trattati come salti interni.
 */
export type OutlineEntry = {
  id: string;
  title: string;
  page: number | null;
  level: number;
};

export type RawOutlineItem = {
  title?: string;
  dest?: unknown;
  url?: unknown;
  items?: RawOutlineItem[];
};

type OutlineSource = {
  getOutline(): Promise<RawOutlineItem[] | null>;
  getDestination(id: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
};

const MAX_LEVEL = 6;
const MAX_ENTRIES = 1500;

/** Risolve una destinazione esplicita o nominata al numero di pagina (1-based). */
async function resolvePage(pdf: OutlineSource, dest: unknown): Promise<number | null> {
  let explicit: unknown = dest;
  if (typeof dest === 'string') {
    try {
      explicit = await pdf.getDestination(dest);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(explicit) || explicit.length === 0) return null;
  const target = explicit[0];
  // Riferimento pagina: risolto con l'indice del documento.
  if (target && typeof target === 'object') {
    try {
      const index = await pdf.getPageIndex(target);
      return Number.isSafeInteger(index) && index >= 0 ? index + 1 : null;
    } catch {
      return null;
    }
  }
  // Destinazione numerica diretta: indice di pagina zero-based.
  if (typeof target === 'number' && Number.isSafeInteger(target) && target >= 0) return target + 1;
  return null;
}

/**
 * Appiattisce l'albero dei segnalibri in ordine gerarchico. Le voci senza
 * destinazione restano come intestazioni non cliccabili solo se hanno figli;
 * le voci foglia non risolvibili vengono scartate.
 */
export async function readOutline(
  pdf: OutlineSource,
  { maxLevel = MAX_LEVEL, maxEntries = MAX_ENTRIES } = {},
): Promise<OutlineEntry[]> {
  let items: RawOutlineItem[] | null = null;
  try {
    items = await pdf.getOutline();
  } catch {
    return [];
  }
  if (!Array.isArray(items)) return [];
  const entries: OutlineEntry[] = [];
  const walk = async (list: RawOutlineItem[], level: number, path: string): Promise<void> => {
    if (level > maxLevel || entries.length >= maxEntries) return;
    for (let i = 0; i < list.length; i++) {
      if (entries.length >= maxEntries) return;
      const item = list[i]!;
      const id = `${path}${i}`;
      const children = Array.isArray(item.items) ? item.items : [];
      const page =
        item.dest !== undefined && item.dest !== null ? await resolvePage(pdf, item.dest) : null;
      // Una voce resta nell'indice solo se è saltabile o fa da gruppo a figli utili:
      // le foglie senza destinazione risolvibile e i soli link esterni vengono scartati.
      if (page !== null || children.length > 0) {
        entries.push({
          id,
          title:
            typeof item.title === 'string' && item.title.trim()
              ? item.title.trim()
              : 'Senza titolo',
          page,
          level,
        });
      }
      if (children.length > 0) await walk(children, level + 1, `${id}-`);
    }
  };
  await walk(items, 1, 'o');
  return entries;
}

/**
 * Contesto di pagina onesto: l'ultima pagina di inizio sezione raggiunta.
 * Se più voci condividono quella pagina, nessuna sezione viene dichiarata.
 */
export function currentSection(entries: OutlineEntry[], page: number): string | undefined {
  const reached = entries.filter((e) => e.page !== null && e.page <= page);
  if (reached.length === 0) return undefined;
  const furthest = Math.max(...reached.map((e) => e.page!));
  const atFurthest = reached.filter((e) => e.page === furthest);
  return atFurthest.length === 1 ? atFurthest[0]!.title : undefined;
}

/** Pagine del gruppo che contiene la pagina corrente (fallback senza indice). */
export function pageGroup(page: number, size = 25): number {
  return Math.floor((page - 1) / size);
}
