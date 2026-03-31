import PDFDocument from 'pdfkit/js/pdfkit.standalone';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TrendCaseData {
  id: number;
  file_no: string | null;
  case_name: string | null;
  court_desc: string | null;
  result: string | null;
  result_date: string | null;
  appeal_date: string | null;
  case_facts: string | null;
  people: Array<{
    id: number;
    role: string | null;
    category: string | null;
    name: string | null;
  }>;
  allegations: Array<{
    id: number;
    section: string | null;
    act_desc: string | null;
  }>;
}

interface CaseFormattedData {
  caseNum: string;
  caseRef: string;
  parties: string;
  highCourtDate: string;
  appealDate: string;
  pleaLabel: string;
  pleaData: string;
  sectionLabel: string;
  sectionData: string;
  factLabel: string;
  factData: string;
  judgePanel: string;
  highCourtResult: string;
  appealResult: string;
  federalResult: string;
}

interface RowState {
  remainingHeight: number;
  text: string;
  started: boolean;
}

interface CellBorders {
  top: boolean;
  bottom: boolean;
  left?: boolean;
  right?: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const PDF_CONFIG = {
  LANDSCAPE_WIDTH: 841.89,
  LANDSCAPE_HEIGHT: 595.28,
  MARGIN: 10,
} as const;

const COLUMN_WIDTHS = {
  no: 25,
  caseRef: 111,
  parties: 228,
  highCourt: 152,
  appealCourt: 152,
  federalCourt: 152,
} as const;

const STYLE_CONFIG = {
  CELL_HEIGHT: 18,
  CELL_PADDING: 2,
  SEPARATOR_HEIGHT: 8,
  FONT_SIZE: 9,
  HEADER_BG: '#D0CECE',
  SEPARATOR_BG: '#000',
  STROKE_WIDTH: 0.5,
} as const;

const TEXT_LABELS = {
  PLEA: 'MENGAKU SALAH / BICARA',
  PLEA_DATA: 'MENGAKU BERSALAH',
  SECTION: 'SEKSYEN',
  FACTS: 'Fakta / Catatan',
  NO_DATA: 'tiada data',
} as const;

const HEADER_LABELS = {
  NO: 'NO',
  CASE_REF: 'NO KES MR',
  PARTIES: 'PIHAK - PIHAK',
  HIGH_COURT: 'MAHKAMAH TINGGI',
  APPEAL_COURT: 'MAHKAMAH RAYUAN',
  FEDERAL_COURT: 'MAHKAMAH PERSEKUTUAN',
} as const;


// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Converts any value to a trimmed string, returning fallback if empty
 */
function asText(value: unknown, fallback: string = TEXT_LABELS.NO_DATA): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

/**
 * Formats a date string or Date object to dd.mm.yyyy format
 */
function formatDate(value: unknown): string {
  if (!value) return TEXT_LABELS.NO_DATA;

  const dateObj = value instanceof Date ? value : new Date(String(value));

  if (isNaN(dateObj.getTime())) return TEXT_LABELS.NO_DATA;

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = String(dateObj.getFullYear());
  return `${day}.${month}.${year}`;
}

/**
 * Extracts and formats accused names from people array
 */
function getAccusedNames(people: TrendCaseData['people']): string {
  const DEFENDANT_KEYWORDS = ['defendan', 'tertuduh', 'accused', 'respondent'];

  const accused = people
    .filter((p) => {
      const category = asText(p.category, '').toLowerCase();
      const role = asText(p.role, '').toLowerCase();
      return DEFENDANT_KEYWORDS.some(
        (keyword) => category.includes(keyword) || role.includes(keyword)
      );
    })
    .map((p) => asText(p.name, ''))
    .filter(Boolean);

  return accused.length > 0 ? accused.join(', ') : TEXT_LABELS.NO_DATA;
}

/**
 * Extracts and formats judge panel information
 */
function getJudgePanel(people: TrendCaseData['people']): string {
  const judges = people.filter((p) => {
    const category = asText(p.category, '').toLowerCase();
    const role = asText(p.role, '').toLowerCase();
    return category === 'corum' || role.includes('hakim');
  });

  if (judges.length === 0) return TEXT_LABELS.NO_DATA;

  return judges
    .map((person) => {
      const role = asText(person.role, 'Pesuruhjaya Kehakiman');
      const name = asText(person.name, '');
      return name ? `${role}: ${name}` : role;
    })
    .join(', ');
}

/**
 * Extracts and formats section information from allegations
 */
function getSectionInfo(allegations: TrendCaseData['allegations']): string {
  if (!allegations || allegations.length === 0) return TEXT_LABELS.NO_DATA;
  const sections = allegations
    .map((a) => asText(a.section, ''))
    .filter(Boolean);
  return sections.length > 0 ? sections.join(', ') : TEXT_LABELS.NO_DATA;
}


// ============================================================================
// PDF Generation Helpers
// ============================================================================

class PDFGenerator {
  private doc: InstanceType<typeof PDFDocument>;
  private chunks: Buffer[] = [];
  private y: number = PDF_CONFIG.MARGIN;

  constructor() {
    this.doc = new PDFDocument({
      size: [PDF_CONFIG.LANDSCAPE_WIDTH, PDF_CONFIG.LANDSCAPE_HEIGHT],
      margin: PDF_CONFIG.MARGIN,
      margins: {
        top: PDF_CONFIG.MARGIN,
        right: PDF_CONFIG.MARGIN,
        bottom: PDF_CONFIG.MARGIN,
        left: PDF_CONFIG.MARGIN,
      },
    });

    this.doc.on('data', (chunk: Buffer) => this.chunks.push(chunk));
  }

  /**
   * Get total table width in PDF units
   */
  private getTotalTableWidth(): number {
    return (
      COLUMN_WIDTHS.no +
      COLUMN_WIDTHS.caseRef +
      COLUMN_WIDTHS.parties +
      COLUMN_WIDTHS.highCourt +
      COLUMN_WIDTHS.appealCourt +
      COLUMN_WIDTHS.federalCourt
    );
  }

  /**
   * Get available vertical space on current page
   */
  private getAvailableSpace(): number {
    return this.doc.page.height - PDF_CONFIG.MARGIN - this.y;
  }

  /**
   * Check if position needs new page
   */
  private needsNewPage(requiredSpace: number): boolean {
    return this.getAvailableSpace() < requiredSpace;
  }

  /**
   * Add a new page with header
   */
  private addNewPage(): void {
    this.doc.addPage({
      size: [PDF_CONFIG.LANDSCAPE_WIDTH, PDF_CONFIG.LANDSCAPE_HEIGHT],
    });
    this.y = PDF_CONFIG.MARGIN;
    this.drawTableHeader();
  }

  /**
   * Measure text height given width
   */
  private measureTextHeight(text: string, width: number): number {
    const savedY = this.doc.y;
    this.doc.fontSize(STYLE_CONFIG.FONT_SIZE);
    const height = this.doc.heightOfString(text || 'A', {
      width: width - STYLE_CONFIG.CELL_PADDING * 2,
    });
    this.doc.y = savedY;
    return Math.max(height + STYLE_CONFIG.CELL_PADDING * 2, 10);
  }

  /**
   * Draw header row
   */
  private drawTableHeader(): void {
    const y = this.y;
    const headers = [
      { x: PDF_CONFIG.MARGIN, width: COLUMN_WIDTHS.no, label: HEADER_LABELS.NO },
      {
        x: PDF_CONFIG.MARGIN + COLUMN_WIDTHS.no,
        width: COLUMN_WIDTHS.caseRef,
        label: HEADER_LABELS.CASE_REF,
      },
      {
        x: PDF_CONFIG.MARGIN + COLUMN_WIDTHS.no + COLUMN_WIDTHS.caseRef,
        width: COLUMN_WIDTHS.parties,
        label: HEADER_LABELS.PARTIES,
      },
      {
        x:
          PDF_CONFIG.MARGIN +
          COLUMN_WIDTHS.no +
          COLUMN_WIDTHS.caseRef +
          COLUMN_WIDTHS.parties,
        width: COLUMN_WIDTHS.highCourt,
        label: HEADER_LABELS.HIGH_COURT,
      },
      {
        x:
          PDF_CONFIG.MARGIN +
          COLUMN_WIDTHS.no +
          COLUMN_WIDTHS.caseRef +
          COLUMN_WIDTHS.parties +
          COLUMN_WIDTHS.highCourt,
        width: COLUMN_WIDTHS.appealCourt,
        label: HEADER_LABELS.APPEAL_COURT,
      },
      {
        x:
          PDF_CONFIG.MARGIN +
          COLUMN_WIDTHS.no +
          COLUMN_WIDTHS.caseRef +
          COLUMN_WIDTHS.parties +
          COLUMN_WIDTHS.highCourt +
          COLUMN_WIDTHS.appealCourt,
        width: COLUMN_WIDTHS.federalCourt,
        label: HEADER_LABELS.FEDERAL_COURT,
      },
    ];

    headers.forEach(({ x, width, label }) => {
      this.drawCell(x, y, width, STYLE_CONFIG.CELL_HEIGHT, label, STYLE_CONFIG.HEADER_BG);
    });

    this.y += STYLE_CONFIG.CELL_HEIGHT;
  }

  /**
   * Draw a filled cell with border and text
   */
  private drawCell(
    x: number,
    cellY: number,
    width: number,
    height: number,
    text: string,
    bgColor?: string
  ): void {
    if (bgColor) {
      this.doc.rect(x, cellY, width, height).fill(bgColor);
    }
    this.doc
      .strokeColor('black')
      .lineWidth(STYLE_CONFIG.STROKE_WIDTH)
      .rect(x, cellY, width, height)
      .stroke();

    this.doc
      .fontSize(STYLE_CONFIG.FONT_SIZE)
      .fillColor('black')
      .font('Helvetica');

    const savedY = this.doc.y;
    this.doc.y = cellY + STYLE_CONFIG.CELL_PADDING;
    this.doc.x = x + STYLE_CONFIG.CELL_PADDING;
    this.doc.text(text, {
      width: width - STYLE_CONFIG.CELL_PADDING * 2,
      height: height - STYLE_CONFIG.CELL_PADDING * 2,
    });
    this.doc.y = savedY;
  }

  /**
   * Draw a cell with selective borders (for multi-row splitting)
   */
  private drawCellPiece(
    x: number,
    cellY: number,
    width: number,
    height: number,
    text: string,
    borders: CellBorders
  ): void {
    const drawLeft = borders.left ?? true;
    const drawRight = borders.right ?? true;

    this.doc.strokeColor('black').lineWidth(STYLE_CONFIG.STROKE_WIDTH);
    if (borders.top) {
      this.doc.moveTo(x, cellY).lineTo(x + width, cellY);
    }
    if (borders.bottom) {
      this.doc.moveTo(x, cellY + height).lineTo(x + width, cellY + height);
    }
    if (drawLeft) {
      this.doc.moveTo(x, cellY).lineTo(x, cellY + height);
    }
    if (drawRight) {
      this.doc.moveTo(x + width, cellY).lineTo(x + width, cellY + height);
    }
    this.doc.stroke();

    this.doc
      .fontSize(STYLE_CONFIG.FONT_SIZE)
      .fillColor('black')
      .font('Helvetica');
    const savedY = this.doc.y;
    this.doc.y = cellY + STYLE_CONFIG.CELL_PADDING;
    this.doc.x = x + STYLE_CONFIG.CELL_PADDING;
    this.doc.text(text, {
      width: width - STYLE_CONFIG.CELL_PADDING * 2,
      height: height - STYLE_CONFIG.CELL_PADDING * 2,
    });
    this.doc.y = savedY;
  }

  /**
   * Split text to fit within height constraints
   */
  private splitTextToFit(
    text: string,
    width: number,
    height: number
  ): { head: string; tail: string } {
    const maxHeight = Math.max(0, height - STYLE_CONFIG.CELL_PADDING * 2);
    if (!text) {
      return { head: '', tail: '' };
    }

    if (
      this.doc.heightOfString(text, { width: width - STYLE_CONFIG.CELL_PADDING * 2 }) <=
      maxHeight
    ) {
      return { head: text, tail: '' };
    }

    let low = 0;
    let high = text.length;
    while (low < high - 1) {
      const mid = Math.floor((low + high) / 2);
      const candidate = text.slice(0, mid);
      if (
        this.doc.heightOfString(candidate, {
          width: width - STYLE_CONFIG.CELL_PADDING * 2,
        }) <= maxHeight
      ) {
        low = mid;
      } else {
        high = mid;
      }
    }

    // Prefer splitting near whitespace for readability
    let splitIndex = low;
    const LOOKBACK_DISTANCE = 40;
    const lookBackStart = Math.max(0, low - LOOKBACK_DISTANCE);
    for (let i = low; i >= lookBackStart; i -= 1) {
      if (/\s/.test(text.charAt(i))) {
        splitIndex = i;
        break;
      }
    }

    // Fall back to character split if no boundary found
    if (splitIndex <= 0) {
      splitIndex = low;
    }

    const head = text.slice(0, splitIndex).trimEnd();
    const tail = text.slice(splitIndex).trimStart();
    return { head, tail };
  }

  /**
   * Format case data for display
   */
  private formatCaseData(caseData: TrendCaseData, caseIndex: number): CaseFormattedData {
    return {
      caseNum: String(caseIndex + 1),
      caseRef: asText(caseData.file_no),
      parties: getAccusedNames(caseData.people),
      highCourtDate: formatDate(caseData.result_date),
      appealDate: formatDate(caseData.appeal_date),
      pleaLabel: TEXT_LABELS.PLEA,
      pleaData: TEXT_LABELS.PLEA_DATA,
      sectionLabel: TEXT_LABELS.SECTION,
      sectionData: getSectionInfo(caseData.allegations),
      factLabel: TEXT_LABELS.FACTS,
      factData: asText(caseData.case_facts),
      judgePanel: getJudgePanel(caseData.people),
      highCourtResult: asText(caseData.result),
      appealResult: TEXT_LABELS.NO_DATA,
      federalResult: 'TIADA',
    };
  }

  /**
   * Calculate row heights for a case
   */
  private calculateRowHeights(data: CaseFormattedData): {
    middleHeights: number[];
    rightHeights: number[];
    caseHeight: number;
  } {
    const middleRow1 = Math.max(
      this.measureTextHeight(data.caseRef, COLUMN_WIDTHS.caseRef),
      this.measureTextHeight(data.parties, COLUMN_WIDTHS.parties)
    );

    const middleRow2 = Math.max(
      this.measureTextHeight(data.pleaLabel, COLUMN_WIDTHS.caseRef),
      this.measureTextHeight(data.pleaData, COLUMN_WIDTHS.parties)
    );

    const middleRow3 = Math.max(
      this.measureTextHeight(data.sectionLabel, COLUMN_WIDTHS.caseRef),
      this.measureTextHeight(data.sectionData, COLUMN_WIDTHS.parties)
    );

    const middleRow4 = Math.max(
      this.measureTextHeight(data.factLabel, COLUMN_WIDTHS.caseRef),
      this.measureTextHeight(data.factData, COLUMN_WIDTHS.parties)
    );

    const rightRow1 = Math.max(
      this.measureTextHeight(data.highCourtDate, COLUMN_WIDTHS.highCourt),
      this.measureTextHeight(data.appealDate, COLUMN_WIDTHS.appealCourt),
      this.measureTextHeight(data.federalResult, COLUMN_WIDTHS.federalCourt)
    );

    const rightRow2 = Math.max(
      this.measureTextHeight(data.highCourtResult, COLUMN_WIDTHS.highCourt),
      this.measureTextHeight(data.appealResult, COLUMN_WIDTHS.appealCourt)
    );

    const rightRow3 = Math.max(this.measureTextHeight(data.judgePanel, COLUMN_WIDTHS.highCourt), 10);

    const middleStaticTotal = middleRow1 + middleRow2 + middleRow3;
    const rightStaticTotal = rightRow1 + rightRow2;
    const caseHeight = Math.max(
      middleStaticTotal + middleRow4,
      rightStaticTotal + rightRow3,
      10
    );

    return {
      middleHeights: [
        middleRow1,
        middleRow2,
        middleRow3,
        Math.max(caseHeight - middleStaticTotal, 10),
      ],
      rightHeights: [rightRow1, rightRow2, Math.max(caseHeight - rightStaticTotal, 10)],
      caseHeight,
    };
  }

  /**
   * Draw a complete case row with multi-row support
   */
  private drawCaseRow(data: CaseFormattedData): void {
    const { middleHeights, rightHeights, caseHeight } = this.calculateRowHeights(data);

    // Column positions
    const noX = PDF_CONFIG.MARGIN;
    const caseRefX = PDF_CONFIG.MARGIN + COLUMN_WIDTHS.no;
    const partiesX = caseRefX + COLUMN_WIDTHS.caseRef;
    const highCourtX = partiesX + COLUMN_WIDTHS.parties;
    const appealCourtX = highCourtX + COLUMN_WIDTHS.highCourt;
    const federalX = appealCourtX + COLUMN_WIDTHS.appealCourt;

    // Initialize row states
    const middleRows: RowState[][] = [
      [
        { remainingHeight: middleHeights[0], text: data.caseRef, started: false },
        { remainingHeight: middleHeights[0], text: data.parties, started: false },
      ],
      [
        { remainingHeight: middleHeights[1], text: data.pleaLabel, started: false },
        { remainingHeight: middleHeights[1], text: data.pleaData, started: false },
      ],
      [
        { remainingHeight: middleHeights[2], text: data.sectionLabel, started: false },
        { remainingHeight: middleHeights[2], text: data.sectionData, started: false },
      ],
      [
        { remainingHeight: middleHeights[3], text: data.factLabel, started: false },
        { remainingHeight: middleHeights[3], text: data.factData, started: false },
      ],
    ];

    const rightRows: RowState[][] = [
      [
        { remainingHeight: rightHeights[0], text: data.highCourtDate, started: false },
        { remainingHeight: rightHeights[0], text: data.appealDate, started: false },
        { remainingHeight: rightHeights[0], text: data.federalResult, started: false },
      ],
      [
        { remainingHeight: rightHeights[1], text: data.highCourtResult, started: false },
        { remainingHeight: rightHeights[1], text: data.appealResult, started: false },
        { remainingHeight: rightHeights[1], text: '', started: false },
      ],
      [
        { remainingHeight: rightHeights[2], text: data.judgePanel, started: false },
        { remainingHeight: rightHeights[2], text: '', started: false },
        { remainingHeight: rightHeights[2], text: '', started: false },
      ],
    ];

    // Draw rows with multi-page support
    let numberRemainingHeight = caseHeight;
    let numberPrinted = false;
    let middleIdx = 0;
    let rightIdx = 0;

    while (numberRemainingHeight > 0 && (middleIdx < middleRows.length || rightIdx < rightRows.length)) {
      if (this.needsNewPage(6)) {
        this.addNewPage();
      }

      const available = this.getAvailableSpace();
      const numberNeed = numberRemainingHeight;
      const middleNeed = middleIdx < middleRows.length ? middleRows[middleIdx][0].remainingHeight : Number.POSITIVE_INFINITY;
      const rightNeed = rightIdx < rightRows.length ? rightRows[rightIdx][0].remainingHeight : Number.POSITIVE_INFINITY;
      const segmentHeight = Math.min(available, numberNeed, middleNeed, rightNeed);

      if (!(segmentHeight > 0)) {
        break;
      }

      const segmentAtContentTop = Math.abs(this.y - (PDF_CONFIG.MARGIN + STYLE_CONFIG.CELL_HEIGHT)) < 0.01;
      const segmentAtPageBottom = this.y + segmentHeight >= this.doc.page.height - PDF_CONFIG.MARGIN - 0.01;

      // Draw NO column
      this.drawCellPiece(noX, this.y, COLUMN_WIDTHS.no, segmentHeight, numberPrinted ? '' : data.caseNum, {
        top: !numberPrinted || segmentAtContentTop,
        bottom: numberRemainingHeight - segmentHeight <= 0 || segmentAtPageBottom,
      });
      numberPrinted = true;
      numberRemainingHeight -= segmentHeight;

      // Draw middle columns (case ref, parties)
      if (middleIdx < middleRows.length) {
        const middleRow = middleRows[middleIdx];
        const caseRefSplit = this.splitTextToFit(middleRow[0].text, COLUMN_WIDTHS.caseRef, segmentHeight);
        const partiesSplit = this.splitTextToFit(middleRow[1].text, COLUMN_WIDTHS.parties, segmentHeight);
        const middleRowEnds = middleRow[0].remainingHeight - segmentHeight <= 0;
        const middleTop = !middleRow[0].started || segmentAtContentTop;
        const middleBottom = middleRowEnds || segmentAtPageBottom;

        this.drawCellPiece(caseRefX, this.y, COLUMN_WIDTHS.caseRef, segmentHeight, caseRefSplit.head, {
          top: middleTop,
          bottom: middleBottom,
        });
        this.drawCellPiece(partiesX, this.y, COLUMN_WIDTHS.parties, segmentHeight, partiesSplit.head, {
          top: middleTop,
          bottom: middleBottom,
        });

        middleRow[0].text = caseRefSplit.tail;
        middleRow[1].text = partiesSplit.tail;
        middleRow[0].remainingHeight -= segmentHeight;
        middleRow[0].started = true;
        if (middleRowEnds) {
          middleIdx += 1;
        }
      } else {
        this.drawCellPiece(caseRefX, this.y, COLUMN_WIDTHS.caseRef, segmentHeight, '', {
          top: segmentAtContentTop,
          bottom: segmentAtPageBottom,
        });
        this.drawCellPiece(partiesX, this.y, COLUMN_WIDTHS.parties, segmentHeight, '', {
          top: segmentAtContentTop,
          bottom: segmentAtPageBottom,
        });
      }

      // Draw right columns (high court, appeal, federal)
      if (rightIdx < rightRows.length) {
        const rightRow = rightRows[rightIdx];
        const highSplit = this.splitTextToFit(rightRow[0].text, COLUMN_WIDTHS.highCourt, segmentHeight);
        const appealSplit = this.splitTextToFit(rightRow[1].text, COLUMN_WIDTHS.appealCourt, segmentHeight);
        const federalSplit = this.splitTextToFit(rightRow[2].text, COLUMN_WIDTHS.federalCourt, segmentHeight);
        const rightRowEnds = rightRow[0].remainingHeight - segmentHeight <= 0;
        const rightTop = !rightRow[0].started || segmentAtContentTop;
        const rightBottom = rightRowEnds || segmentAtPageBottom;

        this.drawCellPiece(highCourtX, this.y, COLUMN_WIDTHS.highCourt, segmentHeight, highSplit.head, {
          top: rightTop,
          bottom: rightBottom,
        });
        this.drawCellPiece(appealCourtX, this.y, COLUMN_WIDTHS.appealCourt, segmentHeight, appealSplit.head, {
          top: rightTop,
          bottom: rightBottom,
        });
        this.drawCellPiece(federalX, this.y, COLUMN_WIDTHS.federalCourt, segmentHeight, federalSplit.head, {
          top: rightTop,
          bottom: rightBottom,
        });

        rightRow[0].text = highSplit.tail;
        rightRow[1].text = appealSplit.tail;
        rightRow[2].text = federalSplit.tail;
        rightRow[0].remainingHeight -= segmentHeight;
        rightRow[0].started = true;
        if (rightRowEnds) {
          rightIdx += 1;
        }
      } else {
        this.drawCellPiece(highCourtX, this.y, COLUMN_WIDTHS.highCourt, segmentHeight, '', {
          top: segmentAtContentTop,
          bottom: segmentAtPageBottom,
        });
        this.drawCellPiece(appealCourtX, this.y, COLUMN_WIDTHS.appealCourt, segmentHeight, '', {
          top: segmentAtContentTop,
          bottom: segmentAtPageBottom,
        });
        this.drawCellPiece(federalX, this.y, COLUMN_WIDTHS.federalCourt, segmentHeight, '', {
          top: segmentAtContentTop,
          bottom: segmentAtPageBottom,
        });
      }

      this.y += segmentHeight;
    }
  }

  /**
   * Draw separator between cases
   */
  private drawSeparator(): void {
    if (this.needsNewPage(STYLE_CONFIG.SEPARATOR_HEIGHT)) {
      this.addNewPage();
    }

    this.doc
      .rect(PDF_CONFIG.MARGIN, this.y, this.getTotalTableWidth(), STYLE_CONFIG.SEPARATOR_HEIGHT)
      .fill(STYLE_CONFIG.SEPARATOR_BG);
    this.y += STYLE_CONFIG.SEPARATOR_HEIGHT;
  }

  /**
   * Generate the complete PDF
   */
  async generate(cases: TrendCaseData[]): Promise<Buffer> {
    this.drawTableHeader();

    cases.forEach((caseData, index) => {
      const formattedData = this.formatCaseData(caseData, index);
      this.drawCaseRow(formattedData);

      // Draw separator between cases (but not after the last one)
      if (index < cases.length - 1) {
        this.drawSeparator();
      }
    });

    return new Promise<Buffer>((resolve, reject) => {
      this.doc.on('end', () => resolve(Buffer.concat(this.chunks)));
      this.doc.on('finish', () => resolve(Buffer.concat(this.chunks)));
      this.doc.on('error', (err) => reject(err));

      this.doc.end();
    });
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Generate a PDF report of trend of sentencing for multiple cases
 * @param cases Array of case data to include in the report
 * @returns Promise resolving to a Buffer containing the PDF data
 */
export async function generateTrendOfSentencingPdf(
  cases: TrendCaseData[]
): Promise<Buffer> {
  try {
    const generator = new PDFGenerator();
    return await generator.generate(cases);
  } catch (error) {
    console.error('[PDF] Error generating PDF:', error);
    throw error;
  }
}
