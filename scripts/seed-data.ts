
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const LOG_FILE = path.join(process.cwd(), 'seed.log');
function log(msg: string) {
    console.log(msg);
    fs.appendFileSync(LOG_FILE, msg + '\n');
}
function error(msg: string, err?: any) {
    console.error(msg, err || '');
    fs.appendFileSync(LOG_FILE, `ERROR: ${msg} ${err ? JSON.stringify(err) : ''}\n`);
}

interface CaseData {
    LKK_INFOID: number;
    LKK_FILE_NO: string;
    LKK_STATUS: string;
    LKK_DATA: any; // Contains courtDesc, stateDesc, etc.
    LKK_RESULT: string;
    LKK_RESULT_DATE: string; // YYYY-MM-DD
    LKK_FINAL_DATE_FOR_APPEAL: string; // YYYY-MM-DD
    LKK_GROUNDS_OF_JUDGEMENT: string;
    LKK_CASE_FACT: string;
    LKK_ISSUES_AND_ARGUMENT: string;
    LKK_DPP_SUGGESTION: string;
    LKK_DSP_SUGGESTION: string;
}

interface PersonData {
    LTL_PERSON_ID: number;
    LKK_INFOID: number;
    LTL_DATA: any; // Contains namaPihak, noKP, etc.
}

interface AllegationData {
    LLA_ALLEGATION_ID: number;
    LKK_INFOID: any; // sometimes string in JSON
    LLA_TYPE: string;
    LLA_SECTION: string;
    LLA_ACT_DESC: string;
    LLA_CHARGE_NOTES: string;
    LLA_OKT_NAME: string;
    CREATEDDATE: string;
}

async function getDirectories(source: string) {
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
}

function parseDate(dateStr: string | null): string | null {
    if (!dateStr) return null;
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    // Try DD/MM/YYYY
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return null; // Return null if invalid or unknown format
}

async function processDirectory(pool: Pool, dirName: string, basePath: string) {
    log(`\nProcessing directory: ${dirName}`);
    const casesPath = path.join(basePath, dirName, 'clean_info.json');
    const peoplePath = path.join(basePath, dirName, 'clean_people.json');
    const allegationsPath = path.join(basePath, dirName, 'clean_allegation.json');

    if (!fs.existsSync(casesPath)) {
        log(`  Skipping ${dirName}: clean_info.json not found.`);
        return;
    }

    try {
        const casesData: CaseData[] = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
        const peopleData: PersonData[] = fs.existsSync(peoplePath) ? JSON.parse(fs.readFileSync(peoplePath, 'utf8')) : [];
        const allegationsData: AllegationData[] = fs.existsSync(allegationsPath) ? JSON.parse(fs.readFileSync(allegationsPath, 'utf8')) : [];

        log(`  Found: ${casesData.length} cases, ${peopleData.length} people, ${allegationsData.length} allegations.`);

        // 1. Insert Cases and build a map of LKK_INFOID -> DB_ID
        const caseIdMap = new Map<number, number>(); // LKK_INFOID -> case table ID

        for (const c of casesData) {
            const fileOpenDate = parseDate(c.LKK_DATA?.fileOpenDate);
            const resultDate = parseDate(c.LKK_RESULT_DATE);
            const appealDate = parseDate(c.LKK_FINAL_DATE_FOR_APPEAL);

            // Use ON CONFLICT to avoid duplicates if re-running, but ideally we start fresh.
            // Using RETURNING id to capture the generated ID.
            const res = await pool.query(`
                INSERT INTO cases (
                    source_id, source_folder, file_no, status, case_name, court_desc, state_desc,
                    file_open_date, result, result_date, appeal_date, 
                    grounds_of_judgement, case_facts, issues_and_arguments, 
                    dpp_suggestion, dsp_suggestion, raw_data
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
                ON CONFLICT (source_id, source_folder) DO UPDATE SET
                    updated_at = NOW()
                RETURNING id;
            `, [
                c.LKK_INFOID,
                dirName,
                c.LKK_FILE_NO,
                c.LKK_STATUS,
                c.LKK_DATA?.caseName || null,
                c.LKK_DATA?.courtDesc || null,
                c.LKK_DATA?.stateDesc || null,
                fileOpenDate,
                c.LKK_RESULT,
                resultDate,
                appealDate,
                c.LKK_GROUNDS_OF_JUDGEMENT,
                c.LKK_CASE_FACT,
                c.LKK_ISSUES_AND_ARGUMENT,
                c.LKK_DPP_SUGGESTION,
                c.LKK_DSP_SUGGESTION,
                JSON.stringify(c)
            ]);

            if (res.rows.length > 0) {
                caseIdMap.set(c.LKK_INFOID, res.rows[0].id);
            }
            // Log progress
            if (caseIdMap.size % 10 === 0) {
                log(`  Processed ${caseIdMap.size} cases...`);
            }
        }
        log(`  > Inserted/Updated cases for ${dirName}`);

        // 2. Insert People linked to Case DB ID
        // Note: For simplicity in this script, we aren't using batch inserts for linked data 
        // because we need to look up the parent ID for each record individually.
        // Given the scale (hundreds/thousands), single inserts are acceptable locally.
        for (const p of peopleData) {
            const caseDbId = caseIdMap.get(p.LKK_INFOID);
            if (!caseDbId) continue;

            const name = p.LTL_DATA?.namaPihak || p.LTL_DATA?.namaPerayuResponden || 'Unknown';

            try {
                await pool.query(`
                    INSERT INTO people (
                        case_id, source_id, role, category, name, id_no, email, phone, address, raw_data
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                `, [
                    caseDbId,
                    p.LTL_PERSON_ID,
                    p.LTL_DATA?.peranan || null,
                    p.LTL_DATA?.category || null,
                    name,
                    p.LTL_DATA?.noKP || null,
                    p.LTL_DATA?.emailPerayuResponden || null,
                    p.LTL_DATA?.noPhonePerayuResponden || null,
                    p.LTL_DATA?.officeAddressO || null,
                    JSON.stringify(p)
                ]);
            } catch (err) {
                error(`  Failed to insert person ${p.LTL_PERSON_ID}:`, err);
            }
        }
        log(`  > Inserted people for ${dirName}`);

        // 3. Insert Allegations linked to Case DB ID
        for (const a of allegationsData) {
            // LKK_INFOID in allegation might be string or number
            const lookupId = typeof a.LKK_INFOID === 'string' ? parseInt(a.LKK_INFOID) : a.LKK_INFOID;
            const caseDbId = caseIdMap.get(lookupId);
            if (!caseDbId) continue;

            try {
                await pool.query(`
                    INSERT INTO allegations (
                        case_id, source_id, type, section, act_desc, charge_notes, okt_name, charge_created_date, raw_data
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    caseDbId,
                    a.LLA_ALLEGATION_ID,
                    a.LLA_TYPE,
                    a.LLA_SECTION,
                    a.LLA_ACT_DESC,
                    a.LLA_CHARGE_NOTES,
                    a.LLA_OKT_NAME,
                    a.CREATEDDATE ? new Date(a.CREATEDDATE) : null,
                    JSON.stringify(a)
                ]);
            } catch (err) {
                error(`  Failed to insert allegation ${a.LLA_ALLEGATION_ID}:`, err);
            }
        }
        log(`  > Inserted allegations for ${dirName}`);

    } catch (err) {
        error(`Error processing directory ${dirName}:`, err);
    }
}

async function main() {
    log('Starting data seed process with NEW SCHEMA...');
    const pool = new Pool({ connectionString: CONNECTION_STRING });

    try {
        await pool.connect();

        const cleanedDataPath = path.join(process.cwd(), 'data', 'cleaned');
        const directories = await getDirectories(cleanedDataPath);

        for (const dir of directories) {
            await processDirectory(pool, dir, cleanedDataPath);
        }

        log('\nAll data processed successfully.');
    } catch (err) {
        error('Fatal error:', err);
    } finally {
        await pool.end();
    }
}

main().catch(err => error('Unhandled rejection', err));
