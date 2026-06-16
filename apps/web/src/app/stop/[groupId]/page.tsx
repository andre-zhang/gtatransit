import { PageShell } from "@/components/PageShell";
import { StopBoardClient } from "@/components/StopBoardClient";
import { getPageMeta } from "@/lib/page-meta";

export default async function StopPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const { demo, rtUpdated } = await getPageMeta();

  return (
    <PageShell rtUpdated={rtUpdated} demo={demo}>
      <StopBoardClient groupId={groupId} />
    </PageShell>
  );
}
