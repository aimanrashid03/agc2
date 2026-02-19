
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const anonKey = envConfig.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const defaultSecret = 'super-secret-jwt-token-with-at-least-32-characters-long';

if (!anonKey) {
    console.error('No ANON_KEY found in .env.local');
    process.exit(1);
}

try {
    const decoded = jwt.verify(anonKey, defaultSecret);
    console.log('✅ Default secret is CORRECT!');
    console.log('Decoded payload:', decoded);

    // Generate service_role key
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const serviceRolePayload = {
        ...decoded,
        role: 'service_role',
        iat: currentTimestamp,
        exp: decoded.exp // Keep same expiry or extend it
    };

    const serviceRoleKey = jwt.sign(serviceRolePayload, defaultSecret);
    console.log('🔑 GENERATED SERVICE_ROLE_KEY:');
    console.log(serviceRoleKey);

} catch (err) {
    console.error('❌ Verification FAILED with default secret:', err.message);
    // Try to inspect the token without verifying signature
    const decodedUnsafe = jwt.decode(anonKey);
    console.log('Decoded payload (unsafe):', decodedUnsafe);
}
