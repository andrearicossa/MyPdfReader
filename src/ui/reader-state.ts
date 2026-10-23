import type { AnnotationData } from '../core/annotations';
import type { FileState } from '../storage/file-session';

export function cacheNeedsAttention(state: FileState<AnnotationData>): boolean {
  return (
    state.cacheMessage.startsWith('Cache non salvata') ||
    state.cacheMessage.startsWith('Cache locale non disponibile')
  );
}

export function persistenceLabel(state: FileState<AnnotationData>): string {
  if (state.conflict || state.status === 'conflict') return 'Conflitto';
  if (state.status === 'error') return 'Scrittura fallita';
  if (state.cacheMessage.startsWith('Cache non salvata')) return 'Cache non salvata';
  if (cacheNeedsAttention(state)) return 'Cache non disponibile';
  if (state.status === 'saving') return 'Salvataggio…';
  if (state.mode === 'automatic') {
    if (state.status === 'saved' && state.writeConfirmed && !state.unexported)
      return 'JSON aggiornato';
    return state.unexported ? 'Da salvare' : 'File collegato';
  }
  if (state.unexported) return 'Da esportare';
  return state.message.startsWith('Download avviato') ? 'Download avviato' : 'Copia nel browser';
}
