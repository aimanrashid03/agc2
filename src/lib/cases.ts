/**
 * Server-side case data access via the `pg` pool (local pgvector / on-prem Postgres).
 * Replaces the supabase-js reads in the pages so the app shows the same MySQL-sourced
 * data the chat uses (and citation links resolve to the right case).
 *
 * Importing the `pg` pool keeps this module server-only — never import it from a
 * client component. Dates are returned as ISO strings (jsonb serialization) to match
 * what supabase-js returned, so the pages' string-based date logic is unchanged.
 */
import pool from '@/lib/db';
import type { Case, CaseListItem } from '@/types';

// Builds each case as one jsonb object: all case columns + nested people/allegations,
// mirroring supabase's `*, people(*), allegations(*)`. (alias is case_json — `case` is reserved.)
const CASE_WITH_RELATIONS = `
    to_jsonb(c.*) || jsonb_build_object(
        'people',      (SELECT COALESCE(jsonb_agg(to_jsonb(p.*) ORDER BY p.id), '[]'::jsonb) FROM people p WHERE p.case_id = c.id),
        'allegations', (SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.id), '[]'::jsonb) FROM allegations a WHERE a.case_id = c.id)
    ) AS case_json`;

/** All cases + nested people/allegations, ordered by file_open_date asc (home/list page). */
export async function getCasesWithRelations(): Promise<Case[]> {
    const { rows } = await pool.query(
        `SELECT ${CASE_WITH_RELATIONS} FROM cases c ORDER BY c.file_open_date ASC NULLS LAST`);
    return rows.map(r => r.case_json as Case);
}

/** Single case + nested people/allegations, or null if not found (detail page). */
export async function getCaseWithRelations(id: number): Promise<Case | null> {
    const { rows } = await pool.query(
        `SELECT ${CASE_WITH_RELATIONS} FROM cases c WHERE c.id = $1`, [id]);
    return rows.length ? (rows[0].case_json as Case) : null;
}

/**
 * Lightweight, flat projection for the cases list/table — no raw_data, no nested relations.
 * okt_name/akta/seksyen are derived in SQL (indexed correlated subqueries on people/allegations
 * case_id) so the home page ships a few MB instead of the ~146 MB getCasesWithRelations produced.
 * Dates come back as ISO strings via to_jsonb, same as getDashboardCases.
 */
export async function getCasesForList(): Promise<CaseListItem[]> {
    const { rows } = await pool.query(`
        SELECT to_jsonb(t) AS j FROM (
            SELECT
                c.id, c.file_no, c.case_name, c.file_open_date, c.court_desc, c.status,
                c.source_folder, c.state_desc, c.updated_at,
                (SELECT string_agg(p.name, ', ' ORDER BY p.id)
                   FROM people p
                  WHERE p.case_id = c.id AND p.name IS NOT NULL AND p.name <> ''
                    AND (p.category IN ('accused','respondent') OR lower(p.role) LIKE '%tertuduh%')
                ) AS okt_name,
                (SELECT string_agg(DISTINCT a.act_desc, ', ')
                   FROM allegations a
                  WHERE a.case_id = c.id AND a.act_desc IS NOT NULL AND a.act_desc <> ''
                ) AS akta,
                (SELECT string_agg(DISTINCT a.section, ', ')
                   FROM allegations a
                  WHERE a.case_id = c.id AND a.section IS NOT NULL AND a.section <> ''
                ) AS seksyen
            FROM cases c
            ORDER BY c.file_open_date ASC NULLS LAST
        ) t`);
    return rows.map(r => r.j as CaseListItem);
}

export type DashboardCase = {
    id: number;
    status: string | null;
    state_desc: string | null;
    source_folder: string | null;
    updated_at: string | null;
    file_open_date: string | null;
    file_no: string | null;
    case_name: string | null;
};

/** Lightweight columns for the dashboard, ordered by updated_at desc. */
export async function getDashboardCases(): Promise<DashboardCase[]> {
    const { rows } = await pool.query(`
        SELECT to_jsonb(t) AS j FROM (
            SELECT id, status, state_desc, source_folder, updated_at, file_open_date, file_no, case_name
            FROM cases ORDER BY updated_at DESC NULLS LAST
        ) t`);
    return rows.map(r => r.j as DashboardCase);
}
