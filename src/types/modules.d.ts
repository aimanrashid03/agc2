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
  const PDFDocument: any;
  export default PDFDocument;
}
