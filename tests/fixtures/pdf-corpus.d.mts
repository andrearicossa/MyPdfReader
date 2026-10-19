export function makePdf(pages: string[], options?: { rotation?: number }): Buffer;
export function text(value: string, x: number, y: number, size?: number): string;
export function simplePdf(): Buffer;
export function columnsPdf(): Buffer;
export function scannedPdf(): Buffer;
export function mixedPdf(): Buffer;
