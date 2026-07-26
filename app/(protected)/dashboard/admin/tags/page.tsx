import { assertAdmin, getSession } from '@/modules/auth';
import { listAllTags } from '@/modules/tags';
import { TagManager } from '@/components/admin/tag-manager';

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
    <div className="space-y-8">
      <header className="rounded-4xl border border-border admin-header-gradient p-4 md:p-8 text-white shadow-linear-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Admin Workspace</p>
            <h1 className="mt-3 text-3xl font-semibold">Tag Management</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/70">
              Create, edit, merge, and delete tags across all threads.
            </p>
          </div>
        </div>
      </header>

      <TagManager tags={tags} total={total} totalPages={totalPages} currentPage={page} search={search} />
    </div>
  );
}
