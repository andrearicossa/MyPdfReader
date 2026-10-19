/**
 * Formato SPERIMENTALE della Fase 1, volutamente distinto dallo schema MVP.
 * Non contiene ancore/annotazioni definitive. Non modificare il PDF.
 */
export type SpikeData = {
  schema: 'fluido/file-spike';
  version: 1;
  document: { sha256: string; fileName: string; size: number };
  revision: number;
  draftNote: string;
  position: { page: number };
};

export function sidecarName(name: string): string {
  return `${name.replace(/\.pdf$/i, '')}.annotations.json`;
}

export function createSpike(document: SpikeData['document']): SpikeData {
  return {
    schema: 'fluido/file-spike',
    version: 1,
    document,
    revision: 0,
    draftNote: '',
    position: { page: 1 },
  };
}

export function parseSpike(text: string, expectedHash: string): SpikeData {
  if (text.length > 1_000_000) throw new Error('File dati troppo grande (limite prova: 1 MB).');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('JSON non valido. Il file originale non è stato modificato.');
  }
  if (!value || typeof value !== 'object') throw new Error('File dati non valido.');
  const data = value as Partial<SpikeData>;
  if (data.schema !== 'fluido/file-spike' || data.version !== 1) {
    throw new Error('Schema non supportato: questa prova accetta solo fluido/file-spike v1.');
  }
  if (
    !data.document ||
    typeof data.document.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(data.document.sha256) ||
    typeof data.document.fileName !== 'string' ||
    !Number.isSafeInteger(data.document.size) ||
    data.document.size < 0 ||
    !Number.isSafeInteger(data.revision) ||
    (data.revision ?? -1) < 0 ||
    typeof data.draftNote !== 'string' ||
    data.draftNote.length > 100_000 ||
    !data.position ||
    !Number.isSafeInteger(data.position.page) ||
    data.position.page < 1 ||
    data.position.page > 1_000_000
  ) {
    throw new Error('Struttura del file dati non valida.');
  }
  if (data.document.sha256 !== expectedHash) {
    throw new Error('Il file dati appartiene a un PDF diverso (SHA-256 non corrispondente).');
  }
  // Copiare solo i campi riconosciuti; non propagare proprietà estranee.
  return {
    schema: 'fluido/file-spike',
    version: 1,
    document: {
      sha256: data.document.sha256,
      fileName: data.document.fileName,
      size: data.document.size,
    },
    revision: data.revision!,
    draftNote: data.draftNote,
    position: { page: data.position.page },
  };
}

export function serializeSpike(data: SpikeData): string {
  return JSON.stringify(data, null, 2) + '\n';
}
