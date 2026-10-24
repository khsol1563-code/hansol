import {pbkdf2Sync} from 'node:crypto';
import {createEditor as base} from '../cloudflare/editor.mjs';
const passwordSalt='test-only-salt-2026-security';
export const testAuth={passwordSalt,passwordHash:pbkdf2Sync('test-only-admin-password-2026',passwordSalt,100000,32,'sha256').toString('hex')};
export const createEditor=store=>base(store,testAuth);
