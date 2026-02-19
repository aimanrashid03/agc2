
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const CONNECTION_STRING = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

interface CaseData {
    LKK_INFOID: number;
    LKK_FILE_NO: string;
    LKK_STATUS: string;
    LKK_DATA: any;
    LKK_RESULT: string;
    LKK_RESULT_DATE: string;
    LKK_FINAL_DATE_FOR_APPEAL: string;
    LKK_GROUNDS_OF_JUDGEMENT: string;
    LKK_CASE_FACT: string;
    LKK_ISSUES_AND_ARGUMENT: string;
    LKK_DPP_SUGGESTION: string;
    LKK_DSP_SUGGESTION: string;
}

async function getDirectories(source: string) {
    return fs.readdirSync(source, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
}

async function main() {
    console.log('Starting ingestion process...');

    if (!process.env.OPENAI_API_KEY) {
        console.error('Error: OPENAI_API_KEY is not set in .env.local');
        process.exit(1);
    }

    const pool = new Pool({ connectionString: CONNECTION_STRING });
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

    try {
        await pool.connect();

        // Optional: Clear existing embeddings if you want a fresh start
        // await pool.query('DELETE FROM case_embeddings');

        const cleanedDataPath = path.join(process.cwd(), 'data', 'cleaned');
        const directories = await getDirectories(cleanedDataPath);

        for (const dir of directories) {
            console.log(`Processing directory: ${dir}`);
            const casesPath = path.join(cleanedDataPath, dir, 'clean_info.json');

            if (!fs.existsSync(casesPath)) {
                console.warn(`  Skipping ${dir}: clean_info.json not found.`);
                continue;
            }

            const casesData: CaseData[] = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
            console.log(`  Found ${casesData.length} cases.`);

            for (const c of casesData) {
                // 1. Find the database ID for this case
                const res = await pool.query(
                    'SELECT id FROM cases WHERE source_id = $1 AND source_folder = $2',
                    [c.LKK_INFOID, dir]
                );

                if (res.rows.length === 0) {
                    console.warn(`  Case not found in DB: ${c.LKK_INFOID} (Folder: ${dir}). Skipping.`);
                    continue;
                }

                const caseId = res.rows[0].id;

                // 2. Construct text content to embed
                // prioritizing important fields
                const textParts = [
                    `Case Name: ${c.LKK_DATA?.caseName || 'N/A'}`,
                    `Court: ${c.LKK_DATA?.courtDesc || 'N/A'}`,
                    `State: ${c.LKK_DATA?.stateDesc || 'N/A'}`,
                    `Facts: ${c.LKK_CASE_FACT || 'N/A'}`,
                    `Issues & Arguments: ${c.LKK_ISSUES_AND_ARGUMENT || 'N/A'}`,
                    `Judgment: ${c.LKK_GROUNDS_OF_JUDGEMENT || 'N/A'}`,
                    `Decision: ${c.LKK_RESULT || 'N/A'}`
                ].filter(part => part.length > 20); // Filter out very short/empty parts

                const fullText = textParts.join('\n\n');

                if (fullText.length < 50) {
                    // console.log(`  Skipping case ${c.LKK_INFOID}: Content too short.`);
                    continue;
                }

                // 3. Split text
                const docs = await splitter.createDocuments([fullText], [{
                    caseId: caseId,
                    source_id: c.LKK_INFOID,
                    source_folder: dir
                }]);

                // 4. Generate Embeddings & Insert
                // Process in batches to avoid rate limits? For now serial is safer for simple script.
                for (const doc of docs) {
                    const embeddingResponse = await openai.embeddings.create({
                        model: 'text-embedding-3-small',
                        input: doc.pageContent,
                    });
                    const embedding = embeddingResponse.data[0].embedding;

                    await pool.query(
                        `INSERT INTO case_embeddings (case_id, content, metadata, embedding) VALUES ($1, $2, $3, $4)`,
                        [caseId, doc.pageContent, doc.metadata, `[${embedding.join(',')}]`]
                    );
                }
                // console.log(`  Processed case ${c.LKK_INFOID}: ${docs.length} chunks.`);
            }
            console.log(`  Finished processing ${dir}`);
        }

        console.log('\nIngestion complete.');

    } catch (err) {
        console.error('Fatal error:', err);
    } finally {
        await pool.end();
    }
}

main().catch(console.error);
