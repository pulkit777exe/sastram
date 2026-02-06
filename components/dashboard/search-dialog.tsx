"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { searchUsersAction } from "@/modules/search/actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Loader2 } from "lucide-react";


export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [data, setData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.length === 0) {
        setData([]);
        return;
      }

      setLoading(true);
      try {
        const res = await searchUsersAction(query, 5);
        
        if (res && 'success' in res && res.success && res.data) {
          setData(res.data.users);
        } else {
          setData([]);
          if (res && 'error' in res) {
            console.error(res.error);
          } else if (res && 'message' in res) {
            console.error(res.message);
          }
        }
      } catch (error) {
        console.error(error);
        setData([]);
      } finally {
        setLoading(false);
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
            "No results found."
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
                    <AvatarImage src={user.avatarUrl || user.image} />
                    <AvatarFallback>
                      {(user.name?.[0] || user.email[0]).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {user.name || "Unnamed"}
                    </span>
                    {user.name && (
                      <span className="text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    )}
                  </div>
                  {user.reputationPoints > 0 && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {user.reputationPoints} rep
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}