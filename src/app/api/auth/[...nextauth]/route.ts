import { handlers } from '@/auth';

// Credential check uses pg + bcrypt -> Node runtime required.
export const runtime = 'nodejs';
export const { GET, POST } = handlers;
