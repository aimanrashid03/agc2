-- Enable pgvector extension for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Cases table
CREATE TABLE cases (
    id SERIAL PRIMARY KEY,
    source_id INTEGER,          -- Original LKK_INFOID
    source_folder TEXT,         -- Distinguishes data source (e.g. "AKTA KANUN KESEKSAAN")
    file_no TEXT,
    status TEXT,
    case_name TEXT,
    court_desc TEXT,
    state_desc TEXT,
    file_open_date DATE,
    result TEXT,
    result_date DATE,
    appeal_date DATE,
    grounds_of_judgement TEXT,
    case_facts TEXT,
    issues_and_arguments TEXT,
    dpp_suggestion TEXT,
    dsp_suggestion TEXT,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(source_id, source_folder)
);

-- People table (accused, prosecutors, judges)
CREATE TABLE people (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
    source_id INTEGER,          -- Original LTL_PERSON_ID
    role TEXT,
    category TEXT,              -- "accused", "prosecutors", "corum"
    name TEXT,
    id_no TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Allegations table (charges per case)
CREATE TABLE allegations (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
    source_id INTEGER,          -- Original LLA_ALLEGATION_ID
    type TEXT,
    section TEXT,
    act_desc TEXT,
    charge_notes TEXT,
    okt_name TEXT,
    charge_created_date TIMESTAMP,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Embeddings table for RAG (vector search)
CREATE TABLE case_embeddings (
    id SERIAL PRIMARY KEY,
    case_id INTEGER REFERENCES cases(id) ON DELETE CASCADE,
    content TEXT,               -- Chunked text from the case
    metadata JSONB,
    embedding vector(1536),     -- OpenAI text-embedding-3-small
    created_at TIMESTAMP DEFAULT NOW()
);

-- Similarity search function used by the chat API
CREATE OR REPLACE FUNCTION match_documents (
    query_embedding text,
    match_threshold float,
    match_count int,
    match_filter jsonb DEFAULT '{}'
)
RETURNS TABLE (
    id integer,
    case_id integer,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        case_embeddings.id,
        case_embeddings.case_id,
        case_embeddings.content,
        case_embeddings.metadata,
        1 - (case_embeddings.embedding <=> query_embedding::vector) AS similarity
    FROM case_embeddings
    WHERE 1 - (case_embeddings.embedding <=> query_embedding::vector) > match_threshold
    AND case_embeddings.metadata @> match_filter
    ORDER BY case_embeddings.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

-- RLS policies (read-only public access)
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE allegations ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read-only access" ON cases FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access" ON people FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access" ON allegations FOR SELECT USING (true);
CREATE POLICY "Allow public read-only access" ON case_embeddings FOR SELECT USING (true);

GRANT SELECT ON cases TO anon, authenticated;
GRANT SELECT ON people TO anon, authenticated;
GRANT SELECT ON allegations TO anon, authenticated;
GRANT SELECT ON case_embeddings TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_documents TO anon, authenticated, service_role;
