
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log(`URL: ${supabaseUrl}`);
console.log(`Key (first 10 chars): ${supabaseKey.substring(0, 10)}...`);

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
    try {
        const { data, error } = await supabase.from('cases').select('id').limit(1);
        if (error) {
            console.error('Error:', error);
        } else {
            console.log('Success! Data:', data);
        }
    } catch (err) {
        console.error('Exception:', err);
    }
}

testConnection();
