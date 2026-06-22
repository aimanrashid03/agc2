declare module 'svg-to-pdfkit' {
  interface SVGtoPDFOptions {
    width?: number;
    height?: number;
    preserveAspectRatio?: string;
  }

  function SVGtoPDF(
    doc: PDFKit.PDFDocument,
    svg: string,
    x: number,
    y: number,
    options?: SVGtoPDFOptions
  ): PDFKit.PDFDocument;

  export default SVGtoPDF;
}

declare module 'pdfkit/js/pdfkit.standalone.js' {
  // The standalone build ships no types; reuse @types/pdfkit's typing.
  import PDFDocument from 'pdfkit';
  export default PDFDocument;
}
