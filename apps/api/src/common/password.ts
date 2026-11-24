import bcrypt from 'bcryptjs';

export const PASSWORD_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_COST);
}

export function passwordNeedsRehash(hash: string): boolean {
  try {
    return bcrypt.getRounds(hash) < PASSWORD_COST;
  } catch {
    return false;
  }
}
