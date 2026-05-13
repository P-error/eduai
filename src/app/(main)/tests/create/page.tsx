import { redirect } from "next/navigation";

export default async function CreateTestRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string; sectionId?: string }>;
}) {
  const params = await searchParams;
  const subjectId = params.subjectId?.trim();
  const sectionId = params.sectionId?.trim();
  if (subjectId) {
    const query = new URLSearchParams({ subjectId });
    if (sectionId) {
      query.set("sectionId", sectionId);
    }
    redirect(`/practice?${query.toString()}`);
  }
  redirect("/practice");
}
