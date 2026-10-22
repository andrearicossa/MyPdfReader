import {
  createAnnotations,
  parseAnnotations,
  serializeAnnotations,
  type AnnotationData,
} from '../core/annotations';
import type { SpikeData } from '../core/file-spike';
import { createWorkCache, type WorkCache } from './cache';
import { FileSession } from './file-session';

export const annotationCache = createWorkCache<AnnotationData>('fluido-annotations-v1');
export function annotationSession(
  document: SpikeData['document'],
  cache: WorkCache<AnnotationData> = annotationCache,
) {
  return new FileSession<AnnotationData>(document, cache, {
    create: createAnnotations,
    parse: parseAnnotations,
    serialize: serializeAnnotations,
    touch: (data) => ({ ...data, updatedAt: new Date().toISOString() }),
  });
}
