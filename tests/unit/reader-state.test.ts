import { describe, expect, it } from 'vitest';
import { persistenceLabel } from '../../src/ui/reader-state';
import { createAnnotations, type AnnotationData } from '../../src/core/annotations';
import { normalizePreferences } from '../../src/core/reading-preferences';
import type { FileState } from '../../src/storage/file-session';

function state(values: Partial<FileState<AnnotationData>> = {}): FileState<AnnotationData> {
  return {
    data: createAnnotations({ sha256: 'a'.repeat(64), fileName: 'a.pdf', size: 1 }),
    mode: 'manual',
    status: 'export',
    message: '',
    cacheMessage: '',
    unexported: false,
    cachePending: false,
    canReconnect: false,
    ...values,
  };
}
describe('UI: stati di persistenza veritieri', () => {
  it('non scambia collegamento o importazione per scrittura', () => {
    expect(persistenceLabel(state({ mode: 'automatic', status: 'saved' }))).toBe('File collegato');
    expect(
      persistenceLabel(state({ mode: 'automatic', status: 'saved', writeConfirmed: false })),
    ).toBe('File collegato');
  });
  it('conferma soltanto un commit concluso e senza modifiche successive', () => {
    expect(
      persistenceLabel(state({ mode: 'automatic', status: 'saved', writeConfirmed: true })),
    ).toBe('JSON aggiornato');
    expect(
      persistenceLabel(
        state({ mode: 'automatic', status: 'pending', unexported: true, writeConfirmed: true }),
      ),
    ).toBe('Da salvare');
  });
  it('download e cache non promettono aggiornamento sul filesystem', () => {
    expect(persistenceLabel(state({ message: 'Download avviato. Verifica il file.' }))).toBe(
      'Download avviato',
    );
    expect(persistenceLabel(state())).toBe('Copia nel browser');
    expect(persistenceLabel(state({ unexported: true }))).toBe('Da esportare');
  });
  it('dà precedenza a errore, conflitto e cache indisponibile', () => {
    expect(
      persistenceLabel(state({ status: 'conflict', mode: 'automatic', writeConfirmed: true })),
    ).toBe('Conflitto');
    expect(persistenceLabel(state({ status: 'error' }))).toBe('Scrittura fallita');
    expect(persistenceLabel(state({ cacheMessage: 'Cache non salvata: quota esaurita' }))).toBe(
      'Cache non salvata',
    );
    expect(persistenceLabel(state({ status: 'saving' }))).toBe('Salvataggio…');
    expect(
      persistenceLabel(
        state({
          cacheMessage:
            'Cache locale non disponibile o non valida: scarica il JSON prima di chiudere.',
        }),
      ),
    ).toBe('Cache non disponibile');
  });
  it('preferenza note retrocompatibile, per dispositivo e validata', () => {
    expect(normalizePreferences({ size: 22 }).notesOpen).toBe(true);
    expect(normalizePreferences({ notesOpen: false }).notesOpen).toBe(false);
    expect(normalizePreferences({ notesOpen: 'false' }).notesOpen).toBe(true);
  });
});
