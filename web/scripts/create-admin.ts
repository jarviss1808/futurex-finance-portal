
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security/password";
import { normalizeLogin } from "../src/lib/security/login-id";

async function main() {
  const login = process.env.ADMIN_LOGIN_ID || "admin";
  const name = process.env.ADMIN_NAME || "FutureX Admin";
  const password = process.env.ADMIN_PASSWORD;
  const email = normalizeLogin(login);

  if (!password || password.length < 12 ||
      password.length > 200) {
    throw new Error(
      "ADMIN_PASSWORD must be 12-200 characters"
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid admin login");
  }

  const existing = await db.user.findUnique({
    where: { email },
  });

  if (existing) {
    throw new Error(
      "This account already exists. No changes made."
    );
  }

  const organizations = await db.organization.findMany({
    select: { id: true, name: true },
    take: 2,
  });

  if (organizations.length > 1) {
    throw new Error(
      "Multiple organizations found. Select the correct " +
      "organization before creating an admin."
    );
  }

  const passwordHash = await hashPassword(password);

  const result = await db.$transaction(async (tx) => {
    const organization =
      organizations[0] ??
      await tx.organization.create({
        data: {
          name: "FutureX Trade",
        },
        select: {
          id: true,
          name: true,
        },
      });

    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        email,
        name,
        passwordHash,
        role: "ADMIN",
        active: true,
      },
      select: {
        id: true,
        email: true,
        role: true,
        active: true,
      },
    });

    return { organization, user };
  });

  console.log("\nAdmin account created successfully");
  console.log("Organization:", result.organization.name);
  console.log("Login:", result.user.email);
  console.log("Role:", result.user.role);
  console.log("Active:", result.user.active);
  console.log("Password: [not displayed]");
}

main()
  .catch((error) => {
    console.error("Admin creation failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
