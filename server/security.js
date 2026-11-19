import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function passwordPolicy(password, confirmation) {
  if (typeof password !== 'string' || [...password].length < 8 || [...password].length > 128 ||
      !/\p{Lu}/u.test(password) || !/[0-9]/.test(password) || !/[^\p{L}\p{N}\s]/u.test(password)) {
    throw new HttpError(400, 'A senha deve ter de 8 a 128 caracteres, uma letra maiúscula, um número e um caractere especial.');
  }
  if (password !== confirmation) throw new HttpError(400, 'A confirmação da senha não confere.');
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${hash.toString('hex')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 512) return false;
  const parts = typeof encoded === 'string' ? encoded.split('$') : [];
  const valid = parts.length === 3 && parts[0] === 'scrypt' && /^[a-f0-9]{32}$/.test(parts[1]) && /^[a-f0-9]{128}$/.test(parts[2]);
  const salt = valid ? parts[1] : '0'.repeat(32);
  const actual = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, Buffer.from(valid ? parts[2] : '0'.repeat(128), 'hex')) && valid;
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('hex');
export function field(value, label, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new HttpError(400, `${label}: informe até ${max} caracteres.`);
  return value.trim();
}
export function emailAddress(value) {
  const email = field(value, 'E-mail', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'E-mail inválido.');
  return email;
}
export function uuid(value) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value || '')) throw new HttpError(400, 'Identificador inválido.');
  return value;
}
export function scope(user, alias = 'r', offset = 1) {
  if (user.role === 'ADMINISTRADOR') return { sql: 'TRUE', values: [] };
  if (user.role === 'GESTOR') return { sql: `${alias}.area_id=$${offset}`, values: [user.area_id] };
  return { sql: `${alias}.created_by_user_id=$${offset}`, values: [user.id] };
}
