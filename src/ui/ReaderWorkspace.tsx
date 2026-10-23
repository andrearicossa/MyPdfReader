import { useState } from 'preact/hooks';
import type { DocumentReader } from '../pdf/document-reader';
import { EnginePanel } from './EnginePanel';
import { FluidReader } from './FluidReader';
import { AnnotationProvider, type AnnotationSession } from './annotations';

export function ReaderWorkspace({
  reader,
  originalUrl,
  session,
  fileName,
  onOpenPdf,
  onStandardPdf,
}: {
  reader: DocumentReader;
  originalUrl: string;
  session: AnnotationSession;
  fileName: string;
  onOpenPdf(): void;
  onStandardPdf(): void;
}) {
  const [technical, setTechnical] = useState(
    () => new URLSearchParams(window.location.search).get('view') === 'technical',
  );
  return (
    <AnnotationProvider session={session}>
      <section class="reader-workspace">
        <nav class="reader-modes" aria-label="Modalità di lettura">
          <button
            class="secondary-button"
            aria-pressed={technical ? 'false' : 'true'}
            onClick={() => setTechnical(false)}
          >
            Lettura fluida
          </button>
          <button
            class="secondary-button"
            aria-pressed={technical ? 'true' : 'false'}
            onClick={() => setTechnical(true)}
          >
            Vista tecnica
          </button>
          <span class="reader-document" data-testid="reader-document">
            {fileName}
          </span>
        </nav>
        {technical ? (
          <EnginePanel reader={reader} originalUrl={originalUrl} />
        ) : (
          <FluidReader
            reader={reader}
            originalUrl={originalUrl}
            fileName={fileName}
            onOpenPdf={onOpenPdf}
            onStandardPdf={onStandardPdf}
            onTechnical={() => setTechnical(true)}
          />
        )}
      </section>
    </AnnotationProvider>
  );
}
