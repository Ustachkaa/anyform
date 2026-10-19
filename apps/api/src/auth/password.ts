import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * Compare against a throwaway hash when the email has no account, so a login
 * for an unknown email takes as long as a wrong password and response time
 * doesn't reveal who is registered.
 */
export async function verifyAgainstNobody(plain: string): Promise<false> {
  dummyHash ??= bcrypt.hash("anyform-no-such-account", COST);
  await bcrypt.compare(plain, await dummyHash).catch(() => false);
  return false;
}
