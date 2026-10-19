import type { SpikeData } from '../core/file-spike';

// Tipi minimi per l'API esterna, senza dipendenze dal DOM nel core.
export interface LocalHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  queryPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  isSameEntry(other: LocalHandle): Promise<boolean>;
  createWritable(): Promise<{
    write(text: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

type PickerOptions = {
  suggestedName?: string;
  multiple?: boolean;
  types: { description: string; accept: Record<string, string[]> }[];
};

type PickerWindow = Window & {
  showOpenFilePicker?: (options: PickerOptions) => Promise<LocalHandle[]>;
  showSaveFilePicker?: (options: PickerOptions) => Promise<LocalHandle>;
};

export function pickers() {
  const win = window as PickerWindow;
  return {
    open: win.showOpenFilePicker?.bind(win),
    save: win.showSaveFilePicker?.bind(win),
  };
}

export const pdfOptions: PickerOptions = {
  multiple: false,
  types: [{ description: 'Documento PDF', accept: { 'application/pdf': ['.pdf'] } }],
};

export const jsonOptions: PickerOptions = {
  multiple: false,
  types: [{ description: 'File annotazioni JSON', accept: { 'application/json': ['.json'] } }],
};

export async function inspectPdf(file: File): Promise<SpikeData['document']> {
  // Controllo minimo, NON validazione strutturale di un PDF (Fase 2).
  const header = new TextDecoder().decode(await file.slice(0, 1024).arrayBuffer());
  if (!header.includes('%PDF-'))
    throw new Error('Il file non ha un’intestazione PDF riconoscibile.');
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  const sha256 = Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return { sha256, fileName: file.name, size: file.size };
}

export function downloadData(text: string, name: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Non revocare prima che il browser abbia avviato il download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
