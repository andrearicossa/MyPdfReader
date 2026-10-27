import {
  getDocument,
  PDFWorker,
  OPS,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  buildReadingModel,
  type RawPage,
  type Rect,
  type ReadingPage,
} from '../core/reading-model';
import { mergeRegions, multiply, transformedRect, type Matrix } from './figures';
import { readOutline, type OutlineEntry } from './outline';
import { rectanglePath, segmentFrames } from './frames';
import { PageCache } from './page-cache';

export type PageExtraction = {
  page: ReadingPage;
  cachedPages: number[];
  removedMarginalLines: number;
};

export class DocumentReader {
  private pages = new PageCache<RawPage>((number) => this.readPage(number), 8);
  private constructor(
    private task: PDFDocumentLoadingTask,
    private pdf: PDFDocumentProxy,
    private worker: Worker,
    private pdfWorker: PDFWorker,
  ) {}
  get pageCount() {
    return this.pdf.numPages;
  }

  private outlineEntries?: Promise<OutlineEntry[]>;

  /** Indice del documento, letto una sola volta per file. Un errore non blocca la lettura. */
  outline(): Promise<OutlineEntry[]> {
    this.outlineEntries ??= readOutline(this.pdf).catch(() => []);
    return this.outlineEntries;
  }

  static async open(file: File): Promise<DocumentReader> {
    const worker = new Worker(workerUrl, { type: 'module', name: 'fluido-pdf' });
    const base = new URL('pdfjs/', new URL(import.meta.env.BASE_URL, document.baseURI)).href;
    const pdfWorker = PDFWorker.create({ port: worker });
    let task: PDFDocumentLoadingTask | undefined;
    try {
      task = getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        worker: pdfWorker,
        isEvalSupported: false,
        enableXfa: false,
        useSystemFonts: false,
        cMapUrl: `${base}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${base}standard_fonts/`,
        wasmUrl: `${base}wasm/`,
        iccUrl: `${base}iccs/`,
      });
      return new DocumentReader(task, await task.promise, worker, pdfWorker);
    } catch (cause) {
      await task?.destroy().catch(() => {});
      pdfWorker.destroy();
      worker.terminate();
      if (cause instanceof Error && cause.name === 'PasswordException')
        throw new Error('PDF protetto da password: apertura non supportata in questa fase.');
      throw new Error('Il PDF non è leggibile: file danneggiato o formato non supportato.');
    }
  }

  async extractPage(number: number, signal: AbortSignal): Promise<PageExtraction> {
    if (!Number.isSafeInteger(number) || number < 1 || number > this.pageCount)
      throw new Error('Pagina fuori intervallo.');
    const raw = await this.pages.get(number, signal);
    signal.throwIfAborted();
    const model = buildReadingModel([...this.pages.values().filter((p) => p.page !== number), raw]);
    return {
      page: model.pages.find((p) => p.page === number)!,
      cachedPages: this.pages.numbers(),
      removedMarginalLines: model.removedMarginalLines,
    };
  }

  private async readPage(number: number): Promise<RawPage> {
    const page = await this.pdf.getPage(number);
    try {
      const viewport = page.getViewport({ scale: 1 });
      const view = viewport.transform as Matrix;
      const content = await page.getTextContent({ disableNormalization: true });
      const runs = content.items.flatMap((item) => {
        if (!('str' in item) || !item.str.trim()) return [];
        const m = multiply(view, item.transform as Matrix);
        const fontSize = Math.hypot(m[2], m[3]);
        return [
          {
            text: item.str,
            x: m[4],
            y: m[5] - fontSize,
            width: Math.abs(item.width),
            height: fontSize,
            fontSize,
            vertical: item.dir === 'ttb' || Math.abs(m[1]) > Math.abs(m[0]) * 0.5,
            rtl: item.dir === 'rtl',
          },
        ];
      });
      const operators = await page.getOperatorList();
      let matrix: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];
      const regions: Rect[] = [];
      const images: Rect[] = [];
      const frames: Rect[] = [];
      const segments: Rect[] = [];
      const graphicWarnings = new Set<string>();
      for (let i = 0; i < operators.fnArray.length; i++) {
        const fn = operators.fnArray[i];
        const args = operators.argsArray[i] as unknown[];
        const before = regions.length;
        if (fn === OPS.save) stack.push([...matrix]);
        else if (fn === OPS.restore) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
        else if (fn === OPS.transform) matrix = multiply(matrix, args as Matrix);
        else if (fn === OPS.paintFormXObjectBegin) {
          stack.push([...matrix]);
          if (args[0]) matrix = multiply(matrix, args[0] as Matrix);
        } else if (fn === OPS.paintFormXObjectEnd) matrix = stack.pop() ?? matrix;
        else if (
          fn === OPS.paintImageXObject ||
          fn === OPS.paintInlineImageXObject ||
          fn === OPS.paintImageMaskXObject
        ) {
          regions.push(transformedRect([0, 0, 1, 1], multiply(view, matrix)));
        } else if (fn === OPS.paintImageXObjectRepeat || fn === OPS.paintImageMaskXObjectRepeat) {
          const positions = args[3] as number[];
          for (let j = 0; j < positions.length; j += 2) {
            regions.push(
              transformedRect(
                [0, 0, 1, 1],
                multiply(
                  view,
                  multiply(matrix, [
                    args[1] as number,
                    0,
                    0,
                    args[2] as number,
                    positions[j]!,
                    positions[j + 1]!,
                  ]),
                ),
              ),
            );
          }
        } else if (
          fn === OPS.shadingFill ||
          fn === OPS.paintInlineImageXObjectGroup ||
          fn === OPS.paintImageMaskXObjectGroup
        ) {
          graphicWarnings.add(
            'Grafica complessa: alcune figure potrebbero non essere isolate. Consulta l’originale.',
          );
        } else if (fn === OPS.constructPath && args[2] && args[0] !== OPS.endPath) {
          const transform = multiply(view, matrix);
          const region = transformedRect(args[2] as [number, number, number, number], transform);
          regions.push(region);
          const frame = rectanglePath((args[1] as unknown[])[0], transform);
          if (frame) frames.push(frame);
          else if (region.width < 1 || region.height < 1) segments.push(region);
        }
        if (
          fn === OPS.paintImageXObject ||
          fn === OPS.paintInlineImageXObject ||
          fn === OPS.paintImageMaskXObject ||
          fn === OPS.paintImageXObjectRepeat ||
          fn === OPS.paintImageMaskXObjectRepeat
        )
          images.push(...regions.slice(before));
      }
      return {
        page: number,
        width: viewport.width,
        height: viewport.height,
        rotation: viewport.rotation,
        runs,
        figures: mergeRegions(regions, viewport.width, viewport.height),
        frames: [...frames, ...segmentFrames(segments)],
        images,
        graphicWarnings: [...graphicWarnings],
      };
    } finally {
      page.cleanup();
    }
  }

  async renderPage(number: number, canvas: HTMLCanvasElement): Promise<void> {
    const page = await this.pdf.getPage(number);
    const viewport = page.getViewport({ scale: 1 });
    await this.renderRegion(
      number,
      { x: 0, y: 0, width: viewport.width, height: viewport.height },
      canvas,
    );
  }

  async renderRegion(pageNumber: number, region: Rect, canvas: HTMLCanvasElement): Promise<void> {
    const page = await this.pdf.getPage(pageNumber);
    const scale = Math.min(
      2,
      1800 / Math.max(region.width, region.height),
      Math.sqrt(4_000_000 / (region.width * region.height)),
    );
    canvas.width = Math.max(1, Math.ceil(region.width * scale));
    canvas.height = Math.max(1, Math.ceil(region.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Rendering canvas non disponibile.');
    await page.render({
      canvas,
      canvasContext: context,
      viewport: page.getViewport({ scale }),
      transform: [1, 0, 0, 1, -region.x * scale, -region.y * scale],
      background: '#ffffff',
    }).promise;
  }

  async close(): Promise<void> {
    this.pages.close();
    try {
      await this.task.destroy();
    } finally {
      this.pdfWorker.destroy();
      this.worker.terminate();
    }
  }
}
