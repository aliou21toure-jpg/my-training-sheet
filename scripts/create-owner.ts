/**
 * Creates THE owner account (there is no sign-up page).
 *
 *   pnpm owner:create you@example.com
 *
 * The password is typed in the terminal (hidden), never passed as an
 * argument, so it does not end up in your shell history.
 */
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ownerAccount, personalSettings } from "../src/db/schema";
import { hashPassword, MIN_PASSWORD_LENGTH } from "../src/features/auth/password";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput.bind(rl);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      write(s.startsWith(question) ? question : s.replace(/[^\r\n]/g, "•"));
    };
    rl.question(question, (answer) => {
      rl.close();
      stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: pnpm owner:create you@example.com");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example).");

  const password = await askHidden("Mot de passe : ");
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
  if ((await askHidden("Confirmer : ")) !== password) throw new Error("Les deux mots de passe diffèrent.");

  const client = postgres(url, { max: 1 });
  try {
    const db = drizzle(client);
    const [owner] = await db
      .insert(ownerAccount)
      .values({ email, passwordHash: await hashPassword(password) })
      .returning({ id: ownerAccount.id });
    await db.insert(personalSettings).values({ ownerId: owner!.id });
    console.log(`Compte créé pour ${email}.`);
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505") throw new Error("Un compte existe déjà : l'application n'en accepte qu'un.");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
