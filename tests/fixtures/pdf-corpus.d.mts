export type CorpusOutlineItem = {
  title: string;
  page: number;
  children?: CorpusOutlineItem[];
};
export function makePdf(
  pages: string[],
  options?: { rotation?: number; outline?: CorpusOutlineItem[] },
): Buffer;
export function text(value: string, x: number, y: number, size?: number): string;
export function simplePdf(): Buffer;
export function outlinedPdf(): Buffer;
export function noOutlinePdf(): Buffer;
export function columnsPdf(): Buffer;
export function scannedPdf(): Buffer;
export function mixedPdf(): Buffer;
export function boxedQuotePdf(options?: {
  segments?: boolean;
  background?: boolean;
  image?: boolean;
}): Buffer;
