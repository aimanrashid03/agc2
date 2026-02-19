
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const secret = 'super-secret-jwt-token-with-at-least-32-characters-long';
const supabaseUrl = 'http://127.0.0.1:54321';

async function testToken(token, label) {
    console.log(`Testing ${label}...`);
    const client = createClient(supabaseUrl, token);
    try {
        const { data, error } = await client.from('cases').select('id').limit(1);
        if (error) {
            console.log(`❌ ${label} Failed:`, error.message);
            return false;
        }
        console.log(`✅ ${label} Succeeded!`);
        return true;
    } catch (e) {
        console.log(`❌ ${label} Exception:`, e.message);
        return false;
    }
}

async function main() {
    const commonPayload = {
        role: 'anon',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year
    };

    // Candidate 1: iss = 'supabase-demo'
    const tokenA = jwt.sign({
        ...commonPayload,
        iss: 'supabase-demo',
        ref: 'agc2' // maybe?
    }, secret);

    // Candidate 2: iss = 'http://127.0.0.1:54321/auth/v1'
    const tokenB = jwt.sign({
        ...commonPayload,
        iss: 'http://127.0.0.1:54321/auth/v1',
    }, secret);

    // Candidate 3: No issuer
    const tokenC = jwt.sign({
        ...commonPayload
    }, secret);

    let workingToken = null;
    let workingIssuer = '';

    if (await testToken(tokenA, 'Candidate A (iss: supabase-demo)')) {
        workingToken = tokenA;
        workingIssuer = 'supabase-demo';
    } else if (await testToken(tokenB, 'Candidate B (iss: auth-v1-url)')) {
        workingToken = tokenB;
        workingIssuer = 'http://127.0.0.1:54321/auth/v1';
    } else if (await testToken(tokenC, 'Candidate C (no issuer)')) {
        workingToken = tokenC;
        workingIssuer = undefined;
    }

    if (workingToken) {
        console.log('\n--- FOUND WORKING CONFIGURATION ---');
        console.log('Issuer:', workingIssuer);

        // Generate Service Role Key
        const serviceRolePayload = {
            role: 'service_role',
            iss: workingIssuer,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60), // 10 years
            ref: 'agc2'
        };
        const serviceRoleKey = jwt.sign(serviceRolePayload, secret);

        // Generate Final Anon Key
        const anonPayload = {
            role: 'anon',
            iss: workingIssuer,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (10 * 365 * 24 * 60 * 60), // 10 years
            ref: 'agc2'
        };
        const finalAnonKey = jwt.sign(anonPayload, secret);

        // Update .env.local
        const envPath = require('path').resolve(process.cwd(), '.env.local');
        let envContent = require('fs').readFileSync(envPath, 'utf8');

        envContent = envContent.replace(/NEXT_PUBLIC_SUPABASE_ANON_KEY=.*/, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${finalAnonKey}`);
        envContent = envContent.replace(/SUPABASE_SERVICE_ROLE_KEY=.*/, `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`);

        require('fs').writeFileSync(envPath, envContent);
        console.log('✅ Updated .env.local with new keys.');

    } else {
        console.error('\n❌ Could not generate a working token with any known issuer configuration.');
    }
}

main();
