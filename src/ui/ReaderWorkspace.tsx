import { useState } from 'preact/hooks';
import type { DocumentReader } from '../pdf/document-reader';
import { EnginePanel } from './EnginePanel';
import { FluidReader } from './FluidReader';

export function ReaderWorkspace({
  reader,
  originalUrl,
}: {
  reader: DocumentReader;
  originalUrl: string;
}) {
  const [technical, setTechnical] = useState(
    () => new URLSearchParams(window.location.search).get('view') === 'technical',
  );
  return (
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
      </nav>
      {technical ? (
        <EnginePanel reader={reader} originalUrl={originalUrl} />
      ) : (
        <FluidReader reader={reader} originalUrl={originalUrl} />
      )}
    </section>
  );
}
