
import dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
    console.log('Testing OpenAI Key directly...');
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error('No API Key found');
        return;
    }
    console.log('Key length:', apiKey.length);

    const client = new OpenAI({ apiKey });

    try {
        const stream = await client.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: 'Say hello' }],
            stream: false,
        });
        console.log('Success:', stream.choices[0].message.content);
    } catch (e: any) {
        console.error('Error:', e.message);
    }
}

main();
