import { describe, expect, it } from 'vitest';
import { createSpike, parseSpike, serializeSpike, sidecarName } from '../../src/core/file-spike';
import { inspectPdf } from '../../src/storage/files';

const document = { sha256: 'a'.repeat(64), fileName: 'prova.pdf', size: 200 };

describe('Schema sperimentale Fase 1 (AC-15, AC-20, AC-21, AC-24)', () => {
  it('crea un JSON valido e conserva testo Unicode e multilinea', () => {
    const data = createSpike(document);
    data.draftNote = 'Caffè <script>non eseguire</script>\nSeconda riga: 日本語';
    expect(parseSpike(serializeSpike(data), document.sha256)).toEqual(data);
  });
  it('accetta un PDF rinominato con lo stesso hash', () => {
    const data = createSpike({ ...document, fileName: 'altro-nome.pdf' });
    expect(parseSpike(serializeSpike(data), document.sha256).document.fileName).toBe(
      'altro-nome.pdf',
    );
  });
  it('respinge il JSON di un PDF diverso', () => {
    expect(() => parseSpike(serializeSpike(createSpike(document)), 'b'.repeat(64))).toThrow(
      'diverso',
    );
  });
  it.each(['{', 'null', '[]', '{"schema":"futuro","version":2}'])(
    'respinge un file invalido: %s',
    (text) => expect(() => parseSpike(text, document.sha256)).toThrow(),
  );
  it.each([0, -1, 1.5, '3', 1_000_001])('respinge pagina invalida: %s', (page) => {
    const data = { ...createSpike(document), position: { page } };
    expect(() => parseSpike(JSON.stringify(data), document.sha256)).toThrow();
  });
  it('genera il nome separato e non cambia il nome originale', () => {
    expect(sidecarName('Libro.PDF')).toBe('Libro.annotations.json');
  });
  it('calcola SHA-256 sui byte, indipendentemente dal nome', async () => {
    const bytes = '%PDF-1.4\nprova';
    const a = await inspectPdf(new File([bytes], 'primo.pdf'));
    const b = await inspectPdf(new File([bytes], 'rinominato.pdf'));
    const c = await inspectPdf(new File([bytes + 'x'], 'primo.pdf'));
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).not.toBe(c.sha256);
  });
  it('respinge un falso PDF prima di sostituire il documento', async () => {
    await expect(inspectPdf(new File(['non pdf'], 'falso.pdf'))).rejects.toThrow('intestazione');
  });
});
