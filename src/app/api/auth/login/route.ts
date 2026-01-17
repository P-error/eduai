import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { issueToken, isAdminEmail } from "@/lib/auth";

const LoginSchema = z.object({
  identifier: z.string().min(2),
});

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  let payload: z.infer<typeof LoginSchema>;
  try {
    payload = LoginSchema.parse(await request.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: "INVALID_INPUT", message },
      { status: 400 },
    );
  }

  const identifier = payload.identifier.trim();
  const email = isEmail(identifier) ? identifier.toLowerCase() : undefined;
  const externalId = email ? `email:${email}` : `nick:${identifier.toLowerCase()}`;
  const name = email ? identifier.split("@")[0] : identifier;

  const isAdmin = isAdminEmail(email);
  const user = await prisma.user.upsert({
    where: { externalId },
    update: {
      email: email ?? undefined,
      name,
      isAdmin,
    },
    create: {
      externalId,
      email,
      name,
      isAdmin,
    },
  });

  const token = issueToken({
    sub: externalId,
    email: user.email ?? undefined,
    name: user.name ?? undefined,
  });

  return NextResponse.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
}
