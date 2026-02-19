create table cases (
  id bigint primary key, -- Corresponds to LKK_INFOID
  file_no text,
  status text, -- LKK_STATUS
  case_name text, -- LKK_DATA.caseName
  court_desc text, -- LKK_DATA.courtDesc
  state_desc text, -- LKK_DATA.stateDesc
  file_open_date date, -- LKK_DATA.fileOpenDate (parsed)
  result text, -- LKK_RESULT
  grounds_of_judgement text, -- LKK_GROUNDS_OF_JUDGEMENT
  case_facts text, -- LKK_CASE_FACT
  issues_and_arguments text, -- LKK_ISSUES_AND_ARGUMENT
  raw_data jsonb, -- Full LKK_DATA object
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table people (
  id bigint primary key, -- Corresponds to LTL_PERSON_ID
  case_id bigint references cases(id), -- Corresponds to LKK_INFOID
  role text, -- LTL_DATA.peranan
  category text, -- LTL_DATA.category
  name text, -- LTL_DATA.namaPihak or namaPerayuResponden
  raw_data jsonb, -- Full LTL_DATA object
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);
