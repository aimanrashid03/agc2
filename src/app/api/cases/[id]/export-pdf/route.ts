import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { buildLaporanFieldAudit, generateLaporanPdf, LaporanCaseData } from '@/lib/laporanPdfGenerator';

export const runtime = 'nodejs';

async function getCase(caseId: string): Promise<LaporanCaseData | null> {
  const client = await pool.connect();

  try {
    // Get case details
    const caseQuery = await client.query(
      `SELECT * FROM cases WHERE id = $1`,
      [caseId]
    );

    if (caseQuery.rows.length === 0) {
      return null;
    }

    const caseData = caseQuery.rows[0];

    // Get people
    const peopleQuery = await client.query(
      `SELECT * FROM people WHERE case_id = $1 ORDER BY role DESC`,
      [caseId]
    );

    // Get allegations
    const allegationsQuery = await client.query(
      `SELECT * FROM allegations WHERE case_id = $1 ORDER BY id`,
      [caseId]
    );

    return {
      ...caseData,
      people: peopleQuery.rows,
      allegations: allegationsQuery.rows,
    } as LaporanCaseData;
  } finally {
    client.release();
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const format = request.nextUrl.searchParams.get('format')?.toLowerCase() ?? 'pdf';
    const debug = request.nextUrl.searchParams.get('debug') === '1';

    if (!id) {
      return NextResponse.json({ error: 'Case ID is required' }, { status: 400 });
    }

    // Fetch case data
    const caseData = await getCase(id);

    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    if (debug) {
      const audit = buildLaporanFieldAudit(caseData);
      return NextResponse.json({
        caseId: caseData.id,
        fileNo: caseData.file_no,
        format,
        debug: true,
        template: 'Laporan_Keputusan_Kes.html',
        audit,
      });
    }

    if (format !== 'pdf') {
      return NextResponse.json(
        { error: 'Only PDF export is currently supported for this endpoint.' },
        { status: 400 }
      );
    }

    const pdfBuffer = await generateLaporanPdf(caseData);

    // Return PDF as response
    return new NextResponse(pdfBuffer as unknown as Response['body'], {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Laporan_${caseData.file_no}_${Date.now()}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('PDF export error:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate Laporan Keputusan Kes PDF.',
      },
      { status: 500 }
    );
  }
}
