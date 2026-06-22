/**
 * Smoke test for the page data-access helpers (src/lib/cases.ts) against local Postgres.
 * Confirms the pg queries return the supabase-shaped nested objects the pages expect.
 *   npx tsx scripts/test-pages-data.ts
 */
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    // dynamic import AFTER dotenv: @/lib/db reads DATABASE_URL at module-load time
    const { getCasesWithRelations, getCaseWithRelations, getDashboardCases } = await import('../src/lib/cases');

    const list = await getCasesWithRelations();
    console.log(`getCasesWithRelations: ${list.length} cases`);
    const withPeople = list.filter(c => (c.people?.length || 0) > 0).length;
    const withAlleg = list.filter(c => (c.allegations?.length || 0) > 0).length;
    console.log(`  with people: ${withPeople} | with allegations: ${withAlleg}`);
    const sample = list.find(c => (c.people?.length || 0) > 0 && (c.allegations?.length || 0) > 0);
    if (sample) {
        console.log(`  sample id=${sample.id} "${sample.case_name?.slice(0, 40)}" folder="${sample.source_folder}"`);
        console.log(`    file_open_date=${JSON.stringify(sample.file_open_date)} (type ${typeof sample.file_open_date})`);
        console.log(`    people[0]=${JSON.stringify(sample.people?.[0]?.name)} allegations[0].act=${JSON.stringify(sample.allegations?.[0]?.act_desc)?.slice(0, 50)}`);
    }

    const one = await getCaseWithRelations(1);
    console.log(`\ngetCaseWithRelations(1): ${one ? `"${one.case_name}" people=${one.people?.length} allegations=${one.allegations?.length}` : 'null'}`);
    const missing = await getCaseWithRelations(9999999);
    console.log(`getCaseWithRelations(9999999): ${missing === null ? 'null (correct)' : 'UNEXPECTED non-null'}`);

    const dash = await getDashboardCases();
    console.log(`\ngetDashboardCases: ${dash.length} rows; first updated_at=${JSON.stringify(dash[0]?.updated_at)} (type ${typeof dash[0]?.updated_at})`);
    console.log('Done.');
    process.exit(0);
}

main().catch(e => { console.error('ERROR:', e); process.exit(1); });
