import { prisma } from "@/lib/prisma";
import TestRunner from "./TestRunner";

export default async function TestPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const test = await prisma.generatedTest.findUnique({
    where: { id },
  });

  if (!test) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <p>Test not found.</p>
      </div>
    );
  }

  const questions = test.questionsJson as {
    prompt: string;
    options: string[];
    answerIndex: number;
    explanation?: string;
  }[];

  return (
    <TestRunner testId={test.id} title={test.topic} questions={questions} />
  );
}
