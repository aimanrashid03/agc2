import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { generateTrendOfSentencingPdf } from '@/lib/trendOfSentencingPdfGenerator';

export const runtime = 'nodejs';

type TrendCaseData = {
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
};

async function getCases(caseIds: number[]): Promise<TrendCaseData[]> {
  const client = await pool.connect();

  try {
    const placeholders = caseIds.map((_, i) => `$${i + 1}`).join(',');

    // Get case details including case_facts
    const caseQuery = await client.query(
      `SELECT id, file_no, case_name, court_desc, result, result_date, appeal_date, case_facts FROM cases WHERE id IN (${placeholders}) ORDER BY id`,
      caseIds
    );

    if (caseQuery.rows.length === 0) {
      return [];
    }

    // Get people for all cases at once
    const peopleQuery = await client.query(
      `SELECT id, case_id, role, category, name FROM people WHERE case_id IN (${placeholders}) ORDER BY case_id, role DESC`,
      caseIds
    );

    // Get allegations for all cases at once
    const allegationsQuery = await client.query(
      `SELECT id, case_id, section, act_desc FROM allegations WHERE case_id IN (${placeholders}) ORDER BY case_id`,
      caseIds
    );

    // Map people to cases
    const peopleByCase = new Map<number, TrendCaseData['people']>();
    for (const person of peopleQuery.rows) {
      if (!peopleByCase.has(person.case_id)) {
        peopleByCase.set(person.case_id, []);
      }
      peopleByCase.get(person.case_id)!.push({
        id: person.id,
        role: person.role,
        category: person.category,
        name: person.name,
      });
    }

    // Map allegations to cases
    const allegationsByCase = new Map<number, TrendCaseData['allegations']>();
    for (const allegation of allegationsQuery.rows) {
      if (!allegationsByCase.has(allegation.case_id)) {
        allegationsByCase.set(allegation.case_id, []);
      }
      allegationsByCase.get(allegation.case_id)!.push({
        id: allegation.id,
        section: allegation.section,
        act_desc: allegation.act_desc,
      });
    }

    // Combine data
    return caseQuery.rows.map(c => ({
      ...c,
      people: peopleByCase.get(c.id) || [],
      allegations: allegationsByCase.get(c.id) || [],
    })) as TrendCaseData[];
  } finally {
    client.release();
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { caseIds } = body;

    if (!Array.isArray(caseIds) || caseIds.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty caseIds array' },
        { status: 400 }
      );
    }

    // Limit to reasonable batch size
    if (caseIds.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 cases per export' },
        { status: 400 }
      );
    }

    console.log(`[PDF Export] Fetching ${caseIds.length} cases...`);
    const cases = await getCases(caseIds);

    if (cases.length === 0) {
      return NextResponse.json(
        { error: 'No cases found' },
        { status: 404 }
      );
    }

    console.log(`[PDF Export] Generating PDF for ${cases.length} cases...`);
    const pdfBuffer = await generateTrendOfSentencingPdf(cases);
    console.log(`[PDF Export] PDF generated successfully`);

    const pdfBody = new Uint8Array(pdfBuffer);
    const timestamp = new Date().toISOString().replace(/[:]/g, '-').replace(/\..+$/, '');
    return new NextResponse(pdfBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="LaporanPelbagaiKes_${timestamp}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to generate report: ${errorMessage}` },
      { status: 500 }
    );
  }
}
