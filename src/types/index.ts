
export interface Allegation {
    id: number;
    case_id: number;
    source_id: number;
    type: string;
    section: string;
    act_desc: string;
    charge_notes: string;
    okt_name: string;
    charge_created_date: string;
    raw_data?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface Person {
    id: number;
    case_id: number;
    source_id: number;
    role: string;
    category: string;
    name: string;
    id_no: string;
    email: string;
    phone: string;
    address: string;
    raw_data?: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

export interface Case {
    id: number;
    source_id: number;
    source_folder: string;
    file_no: string;
    status: string;
    case_name: string;
    court_desc: string;
    state_desc: string;
    file_open_date: string | null;
    result: string | null;
    result_date: string | null;
    appeal_date: string | null;
    grounds_of_judgement: string | null;
    case_facts: string | null;
    issues_and_arguments: string | null;
    dpp_suggestion: string | null;
    dsp_suggestion: string | null;
    raw_data?: Record<string, unknown>;
    created_at: string;
    updated_at: string;

    // Joined properties
    people?: Person[];
    allegations?: Allegation[];

    // Derived properties for UI
    okt_name?: string;
    akta?: string;
    seksyen?: string;
    jenis_fail?: string;
    no_kes?: string;
    kpi?: string;
}

/**
 * Lightweight projection for the cases list/table (src/lib/cases.ts getCasesForList).
 * Only the columns the table renders; okt_name/akta/seksyen are derived in SQL so the
 * home page payload stays small. Defined here (not in cases.ts) so client components can
 * import the type without pulling the `pg` pool into the client bundle.
 */
export interface CaseListItem {
    id: number;
    file_no: string | null;
    case_name: string | null;
    file_open_date: string | null;
    court_desc: string | null;
    status: string | null;
    source_folder: string | null;
    state_desc: string | null;
    updated_at: string | null;
    okt_name: string | null;
    akta: string | null;
    seksyen: string | null;
}
