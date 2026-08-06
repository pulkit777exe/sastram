import { assertAdmin, getSession } from '@/modules/auth';
import { listAllTags } from '@/modules/tags';
import { TagManager } from '@/components/admin/tag-manager';
import { Tags } from 'lucide-react';

export default async function AdminTagsPage(props: {
  searchParams?: Promise<{ page?: string; search?: string }>;
}) {
  const session = await getSession();
  if (!session) return null;
  assertAdmin(session.user);

  const sp = await props.searchParams;
  const page = Number(sp?.page) || 1;
  const search = sp?.search || '';

  const { tags, total, totalPages } = await listAllTags({ page, pageSize: 50, search });

  return (
    <div className="dashboard-page space-y-8 animate-in fade-in duration-500">
      <div className="page-heading">
        <p className="page-eyebrow"><Tags className="h-3.5 w-3.5" /> Admin</p>
        <h1>Tag Management</h1>
        <p>Create, edit, merge, and delete tags across all threads.</p>
      </div>

      <TagManager tags={tags} total={total} totalPages={totalPages} currentPage={page} search={search} />
    </div>
  );
}
