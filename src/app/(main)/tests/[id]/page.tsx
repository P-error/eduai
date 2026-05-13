import { prisma } from "@/lib/prisma";
import { getUserFromToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import {
  assertNoAnswerIndexLeak,
  sanitizeQuestionsForClient,
  type StoredQuestion,
} from "@/lib/test-payload";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import TestRunner from "./TestRunner";

export default async function TestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null;
  const user = await getUserFromToken(token);

  if (!user) {
    redirect("/login");
  }

  const test = await prisma.generatedTest.findFirst({
    where: {
      id,
      userId: user.id,
    },
    select: {
      id: true,
      subjectId: true,
      sectionId: true,
      topic: true,
      questionsJson: true,
    },
  });

  if (!test) {
    notFound();
  }

  if (!Array.isArray(test.questionsJson)) {
    notFound();
  }

  const questions = sanitizeQuestionsForClient(
    test.questionsJson as StoredQuestion[],
  );
  const runnerPayload = {
    testId: test.id,
    subjectId: test.subjectId,
    sectionId: test.sectionId,
    title: test.topic,
    questions,
  };
  assertNoAnswerIndexLeak(runnerPayload, "/tests/[id] server props");

  return <TestRunner {...runnerPayload} />;
}
