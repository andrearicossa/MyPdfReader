import { describe, it, expect } from 'vitest';
import { renderToString } from 'preact-render-to-string';
import { App } from '../../src/ui/App';

describe("Shell dell'applicazione (Fase 0, AC-32)", () => {
  it("mostra il nome dell'app e lo stato di libreria vuota", () => {
    const html = renderToString(<App />);
    expect(html).toContain('Fluido');
    expect(html).toContain('Il tuo PDF, i tuoi file');
  });

  it('dichiara la fase corrente senza promettere funzioni assenti', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Fase 2');
    expect(html).toContain('verifica tecnica');
  });
});
