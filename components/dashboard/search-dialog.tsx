'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { clientLogger } from '@/lib/utils/client-logger';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { searchUsersAction } from '@/modules/search/actions';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';

// TODO: import this from '@/modules/search/types' if a shared type already
// exists there — this is the shape actually consumed below, replacing `any[]`.
interface SearchUser {
  id: string;
  name?: string | null;
  email: string;
  image?: string | null;
}

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [data, setData] = React.useState<SearchUser[]>([]);
  const [loading, setLoading] = React.useState(false);
  // Guards against out-of-order responses: only the response matching the
  // latest fired request is allowed to update state. Previously a fast typer
  // could have an earlier (slower) request resolve after a newer one and
  // silently overwrite fresher results.
  const latestRequestId = React.useRef(0);

  React.useEffect(() => {
    const requestId = ++latestRequestId.current;

    const timer = setTimeout(async () => {
      if (query.length === 0) {
        if (requestId === latestRequestId.current) setData([]);
        return;
      }

      setLoading(true);
      try {
        const res = await searchUsersAction(query, 5);
        if (requestId !== latestRequestId.current) return; // stale response, discard

        if (res?.data) {
          setData(res.data.users);
        } else {
          setData([]);
          if (res?.error) {
            clientLogger.error('SearchDialog', 'User search failed', res.error);
          }
        }
      } catch (error) {
        if (requestId !== latestRequestId.current) return;
        clientLogger.error('SearchDialog', 'User search error', error);
        setData([]);
      } finally {
        if (requestId === latestRequestId.current) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (userId: string) => {
    onOpenChange(false);
    router.push(`/user/${userId}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Type a username or email to search..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {loading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            'No results found.'
          )}
        </CommandEmpty>
        {data.length > 0 && (
          <CommandGroup heading="Users">
            {data.map((user) => (
              <CommandItem
                key={user.id}
                onSelect={() => handleSelect(user.id)}
                className="cursor-pointer"
                value={user.name || user.email}
              >
                <div className="flex items-center gap-2 w-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.image ?? undefined} />
                    <AvatarFallback>
                      {(user.name?.[0] || user.email[0]).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">{user.name || 'Unnamed'}</span>
                    {user.name && (
                      <span className="text-xs text-muted-foreground">{user.email}</span>
                    )}
                  </div>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}