import os
import re
import json
import html
import glob

# Configuration
DATA_DIR = os.path.join(os.path.dirname(__file__), '../data')
CLEAN_DIR = os.path.join(DATA_DIR, 'cleaned')

# File mapping
FILES_TO_PROCESS = {
    'LKK_INFOID.sql': 'clean_info.json',
    'LKK_ALLEGATION.sql': 'clean_allegation.json',
    'LKK_PERSON_INVOLVE.sql': 'clean_people.json'
}

def clean_text(text):
    """
    Cleans text by removing HTML tags, unescaping entities, and normalizing whitespace.
    Removes specific SQL dump artifacts like '\\n'.
    """
    if not text:
        return text
    
    # reject if it's just whitespace
    if isinstance(text, str) and not text.strip():
        return None

    if not isinstance(text, str):
        return text

    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    
    # Unescape HTML entities
    text = html.unescape(text)

    # Remove literal \n sequences often found in SQL dumps
    text = text.replace('\\n', ' ')
    
    # Normalize whitespace (replace newlines, tabs, multiple spaces with single space)
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def parse_sql_value(value):
    """
    Parses a single SQL value string into a Python object.
    Matches standard MySQL quoting.
    """
    if value.upper() == 'NULL':
        return None
    
    # If it's a string literal (starts and ends with ')
    if value.startswith("'") and value.endswith("'"):
        # Remove surrounding quotes
        inner = value[1:-1]
        # Unescape standard SQL escapes
        # \' -> '
        # \" -> "
        # \\ -> \
        # \n -> newline
        # etc.
        # We can implement a simple replacer or use a codec if strictly standard
        # For simplicity and robustness against common SQL dumps:
        inner = inner.replace(r"\'", "'").replace(r'\"', '"').replace(r'\\', '\\')
        return inner
    
    # If it's a number
    try:
        return int(value)
    except ValueError:
        try:
            return float(value)
        except ValueError:
            return value

def parse_insert_statement(line):
    """
    Parses an INSERT INTO statement and returns the column names and a list of values.
    Returns None if not a valid insert.
    """
    # Regex to capture column names and the values part
    # INSERT INTO `table` (`col1`, `col2`) VALUES (val1, val2);
    
    # Simplified regex specific to the file format observed
    # We expect: INSERT INTO `` (`COL1`, ...) VALUES (VAL1, ...);
    
    match = re.search(r"INSERT INTO\s+`[^`]*`\s+\((.*?)\)\s+VALUES\s+\((.*)\);", line, re.IGNORECASE)
    if not match:
        return None
    
    cols_str = match.group(1)
    vals_str = match.group(2)
    
    # Parse columns
    # Columns are backticked: `COL1`, `COL2`
    columns = [c.strip().strip('`') for c in cols_str.split(',')]
    
    # Parse values
    # Values are comma separated, but strings can contain commas.
    # We need a smarter splitter.
    
    values = []
    current_val = []
    in_quote = False
    escape = False
    
    for char in vals_str:
        if escape:
            current_val.append(char)
            escape = False
            continue
            
        if char == '\\':
            current_val.append(char)
            escape = True
            continue
            
        if char == "'" and not escape:
            in_quote = not in_quote
            current_val.append(char)
            continue
            
        if char == ',' and not in_quote:
            # End of value
            val_str = "".join(current_val).strip()
            values.append(parse_sql_value(val_str))
            current_val = []
        else:
            current_val.append(char)
            
    # Append last value
    if current_val:
        val_str = "".join(current_val).strip()
        values.append(parse_sql_value(val_str))
        
    return columns, values

def clean_object(obj):
    """
    Recursively cleans strings within a dictionary or list.
    """
    if isinstance(obj, dict):
        return {k: clean_object(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [clean_object(v) for v in obj]
    elif isinstance(obj, str):
        return clean_text(obj)
    else:
        return obj

def process_file(filepath, output_filename):
    """
    Reads a SQL file, parses it, cleans it, and writes the JSON output.
    """
    print(f"Processing {filepath}...")
    
    data_list = []
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
            for line in f:
                if not line.startswith("INSERT INTO"):
                    continue
                
                result = parse_insert_statement(line.strip())
                if not result:
                    continue
                
                cols, vals = result
                
                # Zip into dict
                row = dict(zip(cols, vals))
                
                # Post-process row
                cleaned_row = {}
                for k, v in row.items():
                    if isinstance(v, str):
                        # Attempt to parse nested JSON if it looks like it
                        # e.g. LKK_DATA, LTL_DATA often contain JSON strings
                        if (v.strip().startswith('{') and v.strip().endswith('}')) or \
                           (v.strip().startswith('[') and v.strip().endswith(']')):
                            try:
                                # We might need to unescape first if it was double escaped in SQL
                                # But usually the parse_sql_value handles the SQL string decode.
                                # Let's try loading it.
                                loaded_json = json.loads(v)
                                # RECURSIVELY clean the loaded object
                                cleaned_row[k] = clean_object(loaded_json)
                            except json.JSONDecodeError:
                                # If valid JSON fails, it might be just text or dirty JSON.
                                # Fallback to cleaning the text.
                                cleaned_row[k] = clean_text(v)
                        else:
                            cleaned_row[k] = clean_text(v)
                    else:
                        cleaned_row[k] = v
                
                # Ensure LKK_INFOID is present (it's the join key)
                if 'LKK_INFOID' in cleaned_row:
                     # ensure it's standard type (e.g. string or int)? 
                     # The prompt implies preserving it. It's usually int.
                     pass
                
                data_list.append(cleaned_row)
                
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return

    # Write output
    os.makedirs(os.path.dirname(output_filename), exist_ok=True)
    with open(output_filename, 'w', encoding='utf-8') as f:
        json.dump(data_list, f, indent=2, ensure_ascii=False)
    
    print(f"Saved {len(data_list)} records to {output_filename}")

def main():
    # Identify subdirectories in DATA_DIR
    for item in os.listdir(DATA_DIR):
        item_path = os.path.join(DATA_DIR, item)
        if not os.path.isdir(item_path):
            continue
            
        print(f"Checking directory: {item}")
        
        # Check if this directory contains the relevant SQL files
        # We process if at least one of the target files exists
        has_target_files = False
        for sql_file in FILES_TO_PROCESS.keys():
            if os.path.exists(os.path.join(item_path, sql_file)):
                has_target_files = True
                break
        
        if not has_target_files:
            continue
            
        print(f"Found legal data in {item}")
        
        # Create output subdirectory
        output_subdir = os.path.join(CLEAN_DIR, item)
        
        for sql_file, json_file in FILES_TO_PROCESS.items():
            input_path = os.path.join(item_path, sql_file)
            output_path = os.path.join(output_subdir, json_file)
            
            if os.path.exists(input_path):
                process_file(input_path, output_path)

if __name__ == "__main__":
    main()
