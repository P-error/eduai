import { redirect } from "next/navigation";

export default async function SubjectDetailsRedirectPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  redirect(`/topics/${encodeURIComponent(subjectId)}`);
}
