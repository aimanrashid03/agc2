import PDFDocument from 'pdfkit/js/pdfkit.standalone';

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

function asText(value: unknown, fallback = '-'): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

function formatDate(value: unknown): string {
  if (!value) return '-';

  let dateObj: Date;
  if (typeof value === 'string') {
    dateObj = new Date(value);
  } else if (value instanceof Date) {
    dateObj = value;
  } else {
    return '-';
  }

  if (isNaN(dateObj.getTime())) return '-';

  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = String(dateObj.getFullYear());
  return `${day}.${month}.${year}`;
}

function getAccusedNames(people: TrendCaseData['people']): string {
  const accused = people
    .filter(p => {
      const category = asText(p.category, '').toLowerCase();
      const role = asText(p.role, '').toLowerCase();
      return (
        category.includes('defendan') ||
        category.includes('tertuduh') ||
        category.includes('accused') ||
        category.includes('respondent') ||
        role.includes('defendan') ||
        role.includes('tertuduh')
      );
    })
    .map(p => asText(p.name, ''))
    .filter(Boolean);

  return accused.length > 0 ? accused.join(', ') : 'tiada data';
}

function getJudgePanel(people: TrendCaseData['people']): string {
  const judges = people.filter(p => {
    const category = asText(p.category, '').toLowerCase();
    const role = asText(p.role, '').toLowerCase();
    return category === 'corum' || role.includes('hakim');
  });

  if (judges.length === 0) return 'tiada data';

  return judges
    .map(person => {
      const role = asText(person.role, 'Pesuruhjaya Kehakiman');
      const name = asText(person.name, '');
      return name ? `${role}: ${name}` : role;
    })
    .join(', ');
}

function getSectionInfo(allegations: TrendCaseData['allegations']): string {
  if (!allegations || allegations.length === 0) return 'tiada data';
  const sections = allegations
    .map(a => asText(a.section, ''))
    .filter(Boolean);
  return sections.length > 0 ? sections.join(', ') : 'tiada data';
}

export function generateTrendOfSentencingPdf(cases: TrendCaseData[]): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: [841.89, 595.28], // A4 landscape
        margin: 20,
        margins: { top: 20, right: 20, bottom: 20, left: 20 },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));

      // No title in report output

      // Table setup
      const leftMargin = 20;
      const rightMargin = 20;
      const bottomMargin = 20;
      const tableWidth = doc.page.width - leftMargin - rightMargin;

      const colWidths = {
        no: Math.round(tableWidth * 0.04),
        caseRef: Math.round(tableWidth * 0.11),
        parties: Math.round(tableWidth * 0.22),
        highCourt: Math.round(tableWidth * 0.21),
        appealCourt: Math.round(tableWidth * 0.21),
        federalCourt: Math.round(tableWidth * 0.21),
      };
      const cellHeight = 20;
      const headerBg = '#D0CECE';
      const baseFontSize = 10;
      const headerFontSize = 10;
      const noFontSize = 10;

      let y = doc.y;
      const headerY = y;

      // Helper to measure text height
      const measureTextHeight = (text: string, width: number): number => {
        const savedY = doc.y;
        doc.fontSize(baseFontSize);
        const height = doc.heightOfString(text || 'A', { width: width - 4 }); // Use 'A' as minimum
        doc.y = savedY;
        return Math.max(height + 4, 12); // Ensure minimum height of 12
      };

      // Helper to draw cells
      const drawCell = (x: number, cellY: number, width: number, height: number, text: string, bgColor?: string) => {
        if (bgColor) {
          doc.rect(x, cellY, width, height).fill(bgColor);
        }
        doc.strokeColor('black').lineWidth(0.5).rect(x, cellY, width, height).stroke();
        
        doc.fontSize(baseFontSize).fillColor('black');

        const savedY = doc.y;
        doc.y = cellY + 2;
        doc.x = x + 2;
        doc.text(text, { width: width - 4, height: height - 4 });
        doc.y = savedY;
      };

      const splitTextToFit = (text: string, width: number, height: number) => {
        const maxHeight = Math.max(0, height - 4);
        if (!text) {
          return { head: '', tail: '' };
        }
        if (doc.heightOfString(text, { width: width - 4 }) <= maxHeight) {
          return { head: text, tail: '' };
        }

        let low = 0;
        let high = text.length;
        while (low < high - 1) {
          const mid = Math.floor((low + high) / 2);
          const candidate = text.slice(0, mid);
          if (doc.heightOfString(candidate, { width: width - 4 }) <= maxHeight) {
            low = mid;
          } else {
            high = mid;
          }
        }

        const head = text.slice(0, low).trimEnd();
        const tail = text.slice(low).trimStart();
        return { head, tail };
      };

      const drawCourtBlock = (x: number, cellY: number, width: number, height: number, keputusan: string, korum: string) => {
        // Outer cell border
        doc.strokeColor('black').lineWidth(0.5).rect(x, cellY, width, height).stroke();

        const padding = 2;
        const contentWidth = width - padding * 2;
        const keputusanHeight = measureTextHeight(keputusan || '', width);
        // Keputusan text
        doc.fontSize(baseFontSize).fillColor('black');
        const savedY = doc.y;
        doc.x = x + padding;
        doc.y = cellY + padding;
        doc.text(keputusan, { width: contentWidth, height: keputusanHeight });

        // Separator line
        const separatorY = cellY + padding + keputusanHeight + 2;
        doc.strokeColor('#999').lineWidth(0.5).moveTo(x + padding, separatorY).lineTo(x + width - padding, separatorY).stroke();

        // Korum text
        doc.y = separatorY + 2;
        doc.text(korum, { width: contentWidth, height: height - (separatorY - cellY) - 4 });
        doc.y = savedY;
      };

      const drawCaseHeader = (headerYPos: number) => {
        doc.fontSize(headerFontSize).fillColor('black');
        drawCell(leftMargin, headerYPos, colWidths.no, cellHeight, 'NO', headerBg);
        drawCell(leftMargin + colWidths.no, headerYPos, colWidths.caseRef, cellHeight, 'NO KES MR', headerBg);
        drawCell(leftMargin + colWidths.no + colWidths.caseRef, headerYPos, colWidths.parties, cellHeight, 'PIHAK - PIHAK', headerBg);
        drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties, headerYPos, colWidths.highCourt, cellHeight, 'MAHKAMAH TINGGI', headerBg);
        drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt, headerYPos, colWidths.appealCourt, cellHeight, 'MAHKAMAH RAYUAN', headerBg);
        drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt + colWidths.appealCourt, headerYPos, colWidths.federalCourt, cellHeight, 'MAHKAMAH PERSEKUTUAN', headerBg);
      };

      y = headerY;

      // Draw data rows
      cases.forEach((caseData, index) => {
        const caseRef = asText(caseData.file_no, 'tiada data');
        const parties = getAccusedNames(caseData.people);
        const section = getSectionInfo(caseData.allegations);
        const caseFacts = asText(caseData.case_facts, 'tiada data');
        const pleaStatus = 'tiada data';
        const highCourtResult = asText(caseData.result, 'tiada data');
        const highCourtDate = formatDate(caseData.result_date);
        const appealDate = formatDate(caseData.appeal_date);
        const federalDate = 'tiada data';
        const judgePanel = getJudgePanel(caseData.people);

        const caseRows = [
          { noKesLabel: '', noKesData: caseRef, pihaKeyData: parties, highCourtData: highCourtDate, appealData: appealDate, federalData: federalDate },
          { noKesLabel: 'MENGAKU SALAH / BICARA', noKesData: '', pihaKeyData: pleaStatus, highCourtData: highCourtResult, appealData: 'tiada data', federalData: 'tiada data' },
          { noKesLabel: 'SEKSYEN', noKesData: '', pihaKeyData: section, highCourtData: judgePanel, appealData: 'tiada data', federalData: 'tiada data' },
          { noKesLabel: 'Fakta / Catatan', noKesData: '', pihaKeyData: caseFacts, highCourtData: '', appealData: '', federalData: '' }
        ];

        const buildKesText = (label: string, data: string) => {
          if (label && data) return `${label}\n${data}`;
          return label || data;
        };

        // Calculate measured heights for columns 2-3 (row-by-row)
        const col23Heights = caseRows.map((row) => {
          const kesText = buildKesText(row.noKesLabel, row.noKesData);
          const kesHeight = measureTextHeight(kesText, colWidths.caseRef);
          const partiesHeight = measureTextHeight(row.pihaKeyData, colWidths.parties);
          return Math.max(kesHeight, partiesHeight);
        });

        // Measure court row 0 height (Tarikh Keputusan)
        const courtRow0Height = Math.max(
          measureTextHeight(caseRows[0].highCourtData, colWidths.highCourt),
          measureTextHeight(caseRows[0].appealData, colWidths.appealCourt),
          measureTextHeight(caseRows[0].federalData, colWidths.federalCourt)
        );

        // Apply dependencies based on template behavior:
        // Row 0: columns 2-6 share the same height
        const row0Height = Math.max(col23Heights[0], courtRow0Height);
        col23Heights[0] = row0Height;

        const totalCaseHeight = col23Heights.reduce((sum, h) => sum + h, 0);
        const availableHeight = doc.page.height - bottomMargin - 20 - y;
        let caseNeedsSplit = totalCaseHeight + cellHeight > availableHeight;
        const fullPageAvailable = doc.page.height - bottomMargin - 20 - 20;

        if (caseNeedsSplit && totalCaseHeight + cellHeight <= fullPageAvailable) {
          doc.addPage({ size: [841.89, 595.28] });
          y = 20;
          caseNeedsSplit = false;
        }

        // Draw header before each case
        drawCaseHeader(y);
        y += cellHeight;

        // Draw each row
        let caseY = y;

        caseRows.forEach((row, rowIndex) => {
          const kesText = buildKesText(row.noKesLabel, row.noKesData);
          const rowHeightFor23 = col23Heights[rowIndex];

          if (!caseNeedsSplit) {
            // Page break if the next row won't fit
            if (caseY + rowHeightFor23 > doc.page.height - bottomMargin - 20) {
              doc.addPage({ size: [841.89, 595.28] });
              caseY = 20;
            }

            // NO column
            if (rowIndex === 0) {
              doc.rect(leftMargin, caseY, colWidths.no, totalCaseHeight).fill('white');
              doc.strokeColor('black').lineWidth(0.5).rect(leftMargin, caseY, colWidths.no, totalCaseHeight).stroke();

              doc.fontSize(noFontSize).fillColor('black').font('Helvetica-Bold');
              const savedY = doc.y;
              doc.y = caseY + 2;
              doc.x = leftMargin + 2;
              doc.text(String(index + 1), { width: colWidths.no - 4, align: 'center' });
              doc.y = savedY;
            }

            // Columns 2-3 (NO KES MR and PIHAK-PIHAK)
            drawCell(leftMargin + colWidths.no, caseY, colWidths.caseRef, rowHeightFor23, kesText);
            drawCell(leftMargin + colWidths.no + colWidths.caseRef, caseY, colWidths.parties, rowHeightFor23, row.pihaKeyData);

            // Columns 4-6 (court columns)
            if (rowIndex === 0) {
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties, caseY, colWidths.highCourt, row0Height, row.highCourtData);
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt, caseY, colWidths.appealCourt, row0Height, row.appealData);
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt + colWidths.appealCourt, caseY, colWidths.federalCourt, row0Height, row.federalData);
            }

            if (rowIndex === 1) {
              const remainingHeight = col23Heights.slice(1).reduce((sum, h) => sum + h, 0);
              drawCourtBlock(
                leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties,
                caseY,
                colWidths.highCourt,
                remainingHeight,
                caseRows[1].highCourtData,
                caseRows[2].highCourtData
              );
              drawCourtBlock(
                leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt,
                caseY,
                colWidths.appealCourt,
                remainingHeight,
                caseRows[1].appealData,
                caseRows[2].appealData
              );
              drawCourtBlock(
                leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt + colWidths.appealCourt,
                caseY,
                colWidths.federalCourt,
                remainingHeight,
                caseRows[1].federalData,
                caseRows[2].federalData
              );
            }

            // Advance by max height to keep alignment
            caseY += rowHeightFor23;
            return;
          }

          // Split-case: segment rows across pages
          let remainingKes = kesText;
          let remainingParties = row.pihaKeyData;
          let remainingHigh = row.highCourtData;
          let remainingAppeal = row.appealData;
          let remainingFederal = row.federalData;
          let segmentIndex = 0;

          while (
            remainingKes ||
            remainingParties ||
            (rowIndex <= 2 && (remainingHigh || remainingAppeal || remainingFederal))
          ) {
            let availableHeight = doc.page.height - bottomMargin - 20 - caseY;
            if (availableHeight < 12) {
              doc.addPage({ size: [841.89, 595.28] });
              caseY = 20;
              availableHeight = doc.page.height - bottomMargin - 20 - caseY;
            }

            const desiredHeight = Math.max(
              measureTextHeight(remainingKes, colWidths.caseRef),
              measureTextHeight(remainingParties, colWidths.parties),
              rowIndex <= 2
                ? Math.max(
                    measureTextHeight(remainingHigh, colWidths.highCourt),
                    measureTextHeight(remainingAppeal, colWidths.appealCourt),
                    measureTextHeight(remainingFederal, colWidths.federalCourt)
                  )
                : 0
            );

            const segmentHeight = Math.max(12, Math.min(availableHeight, desiredHeight));

            // NO column: render each segment to span full case height
            const noText = rowIndex === 0 && segmentIndex === 0 ? String(index + 1) : '';
            drawCell(leftMargin, caseY, colWidths.no, segmentHeight, noText);

            // Split and draw columns 2-3
            const kesSplit = splitTextToFit(remainingKes, colWidths.caseRef, segmentHeight);
            drawCell(leftMargin + colWidths.no, caseY, colWidths.caseRef, segmentHeight, kesSplit.head);
            remainingKes = kesSplit.tail;

            const partiesSplit = splitTextToFit(remainingParties, colWidths.parties, segmentHeight);
            drawCell(leftMargin + colWidths.no + colWidths.caseRef, caseY, colWidths.parties, segmentHeight, partiesSplit.head);
            remainingParties = partiesSplit.tail;

            // Split and draw columns 4-6 (keep borders connected on split pages)
            if (rowIndex <= 2) {
              const highSplit = splitTextToFit(remainingHigh, colWidths.highCourt, segmentHeight);
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties, caseY, colWidths.highCourt, segmentHeight, highSplit.head);
              remainingHigh = highSplit.tail;

              const appealSplit = splitTextToFit(remainingAppeal, colWidths.appealCourt, segmentHeight);
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt, caseY, colWidths.appealCourt, segmentHeight, appealSplit.head);
              remainingAppeal = appealSplit.tail;

              const federalSplit = splitTextToFit(remainingFederal, colWidths.federalCourt, segmentHeight);
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt + colWidths.appealCourt, caseY, colWidths.federalCourt, segmentHeight, federalSplit.head);
              remainingFederal = federalSplit.tail;
            } else {
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties, caseY, colWidths.highCourt, segmentHeight, '');
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt, caseY, colWidths.appealCourt, segmentHeight, '');
              drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt + colWidths.appealCourt, caseY, colWidths.federalCourt, segmentHeight, '');
            }

            caseY += segmentHeight;
            segmentIndex += 1;
          }
        });

        y = caseY;

        // Draw black separator row between cases
        if (index < cases.length - 1) {
          doc.rect(leftMargin, y, colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt + colWidths.appealCourt + colWidths.federalCourt, 4).fill('#000');
          y += 4;
        }

        // Page break if needed
        if (y > doc.page.height - bottomMargin - 20) {
          doc.addPage({ size: [841.89, 595.28] });
          y = 20;

          // Redraw header on new page
          drawCell(leftMargin, y, colWidths.no, cellHeight, 'NO', headerBg);
          drawCell(leftMargin + colWidths.no, y, colWidths.caseRef, cellHeight, 'NO KES MR', headerBg);
          drawCell(leftMargin + colWidths.no + colWidths.caseRef, y, colWidths.parties, cellHeight, 'PIHAK - PIHAK', headerBg);
          drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties, y, colWidths.highCourt, cellHeight, 'MAHKAMAH TINGGI', headerBg);
          drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt, y, colWidths.appealCourt, cellHeight, 'MAHKAMAH RAYUAN', headerBg);
          drawCell(leftMargin + colWidths.no + colWidths.caseRef + colWidths.parties + colWidths.highCourt + colWidths.appealCourt, y, colWidths.federalCourt, cellHeight, 'MAHKAMAH PERSEKUTUAN', headerBg);

          y += cellHeight;
        }
      });

      doc.end();

      const finalize = () => resolve(Buffer.concat(chunks));

      doc.on('end', finalize);
      doc.on('finish', finalize);

      doc.on('error', (err) => {
        console.error('[PDF] PDF error:', err);
        reject(err);
      });
    } catch (error) {
      console.error('[PDF] Error:', error);
      reject(error);
    }
  });
}
