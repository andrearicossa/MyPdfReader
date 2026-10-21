import { useEffect, useRef, useState } from 'preact/hooks';
import type { FigureBlock } from '../core/reading-model';
import type { DocumentReader } from '../pdf/document-reader';

export function FlowFigure({ reader, figure }: { reader: DocumentReader; figure: FigureBlock }) {
  const host = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState('waiting');
  const [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let active = true,
      started = false;
    const render = () => {
      if (started) return;
      started = true;
      setState('loading');
      void reader
        .renderRegion(figure.page, figure.region, canvas.current!)
        .then(() => {
          if (active) setState('ready');
        })
        .catch(() => {
          if (active) setState('error');
        });
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          render();
        }
      },
      { root: host.current?.closest('.flow-viewport'), rootMargin: '150px' },
    );
    observer.observe(host.current!);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [reader, figure.id, retry]);
  return (
    <figure ref={host} class="flow-figure" data-testid="flow-figure">
      <figcaption>
        Figura · pagina {figure.page}
        {figure.placement === 'page-end' ? ' · posizione incerta' : ''}
      </figcaption>
      <div
        class="flow-figure-frame"
        style={{ aspectRatio: `${figure.region.width}/${figure.region.height}` }}
      >
        {state === 'error' ? (
          <p role="alert">
            Figura non disponibile.{' '}
            <button class="text-link" onClick={() => setRetry(retry + 1)}>
              Riprova figura
            </button>{' '}
            oppure consulta l’Originale.
          </p>
        ) : (
          state !== 'ready' && <p role="status">Caricamento figura…</p>
        )}
        <canvas
          ref={canvas}
          hidden={state !== 'ready'}
          role="img"
          aria-label={`Figura della pagina ${figure.page}`}
        />
      </div>
      <button class="secondary-button" disabled={state !== 'ready'} onClick={() => setZoom(true)}>
        Ingrandisci figura
      </button>
      {zoom && <FigureZoom reader={reader} figure={figure} dismiss={() => setZoom(false)} />}
    </figure>
  );
}

function FigureZoom({
  reader,
  figure,
  dismiss,
}: {
  reader: DocumentReader;
  figure: FigureBlock;
  dismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const points = useRef(new Map<number, { x: number; y: number }>());
  const baseline = useRef({ distance: 0, scale: 1, x: 0, y: 0, panX: 0, panY: 0 });
  const lastTap = useRef({ time: 0, x: 0, y: 0 });
  const pinched = useRef(false);
  const recentTouch = useRef(0);
  const zoomTo = (n: number) => {
    setScale(Math.max(1, Math.min(4, n)));
  };
  useEffect(() => {
    const node = dialog.current!;
    node.showModal();
    let active = true;
    void reader
      .renderRegion(figure.page, figure.region, canvas.current!)
      .then(() => {
        if (active) setReady(true);
      })
      .catch(() => {
        if (active) setError('Zoom non disponibile. Consulta l’Originale.');
      });
    return () => {
      active = false;
      node.close();
    };
  }, [reader, figure.id]);
  return (
    <dialog
      ref={dialog}
      class="figure-dialog"
      aria-label={`Zoom figura pagina ${figure.page}`}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
    >
      <div class="zoom-toolbar">
        <h2>Figura · pagina {figure.page}</h2>
        <button class="secondary-button" onClick={dismiss}>
          Chiudi zoom
        </button>
        <button
          class="secondary-button"
          aria-label="Riduci figura"
          disabled={scale <= 1}
          onClick={() => zoomTo(scale - 0.25)}
        >
          −
        </button>
        <output aria-live="polite" data-testid="figure-scale">
          {Math.round(scale * 100)}%
        </output>
        <button
          class="secondary-button"
          aria-label="Ingrandisci figura di un livello"
          disabled={scale >= 4}
          onClick={() => zoomTo(scale + 0.25)}
        >
          +
        </button>
        <button
          class="secondary-button"
          onClick={() => {
            setScale(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Adatta figura
        </button>
      </div>
      <p class="small-note">
        Doppio tocco per ingrandire. Con due dita regola lo zoom; trascina per spostare la figura.
      </p>
      {error && <p role="alert">{error}</p>}
      {!ready && !error && <p role="status">Rendering figura…</p>}
      <div
        class="zoom-stage"
        data-testid="zoom-stage"
        onDblClick={() => {
          if (Date.now() - recentTouch.current < 500) return;
          zoomTo(scale > 1 ? 1 : 2);
          setPan({ x: 0, y: 0 });
        }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (points.current.size === 2) {
            pinched.current = true;
            const [a, b] = [...points.current.values()];
            if (!a || !b) return;
            baseline.current = {
              ...baseline.current,
              distance: Math.hypot(a.x - b.x, a.y - b.y),
              scale,
            };
          } else {
            baseline.current = {
              ...baseline.current,
              x: event.clientX,
              y: event.clientY,
              panX: pan.x,
              panY: pan.y,
            };
          }
        }}
        onPointerMove={(event) => {
          if (!points.current.has(event.pointerId)) return;
          points.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (points.current.size === 2) {
            const [a, b] = [...points.current.values()];
            if (!a || !b) return;
            if (baseline.current.distance > 0)
              zoomTo(
                (baseline.current.scale * Math.hypot(a.x - b.x, a.y - b.y)) /
                  baseline.current.distance,
              );
          } else if (!pinched.current && scale > 1) {
            setPan({
              x: baseline.current.panX + event.clientX - baseline.current.x,
              y: baseline.current.panY + event.clientY - baseline.current.y,
            });
          }
        }}
        onPointerUp={(event) => {
          if (event.pointerType === 'touch') recentTouch.current = Date.now();
          points.current.delete(event.pointerId);
          if (!points.current.size) {
            const moved =
              Math.hypot(event.clientX - baseline.current.x, event.clientY - baseline.current.y) >
              12;
            if (!pinched.current && !moved && event.pointerType === 'touch') {
              const now = Date.now();
              if (
                now - lastTap.current.time < 350 &&
                Math.hypot(event.clientX - lastTap.current.x, event.clientY - lastTap.current.y) <
                  30
              ) {
                zoomTo(scale > 1 ? 1 : 2);
                setPan({ x: 0, y: 0 });
                lastTap.current.time = 0;
              } else lastTap.current = { time: now, x: event.clientX, y: event.clientY };
            }
            pinched.current = false;
          }
        }}
        onPointerCancel={() => {
          points.current.clear();
          pinched.current = false;
          lastTap.current.time = 0;
        }}
      >
        <canvas
          ref={canvas}
          hidden={!ready}
          role="img"
          aria-label="Figura ingrandita"
          style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${scale})` }}
        />
      </div>
    </dialog>
  );
}
