"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, MessageSquare, Users, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  searchThreadsAction,
  searchMessagesAction,
  searchUsersAction,
} from "@/modules/search/actions";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

type SearchType = "all" | "threads" | "messages" | "users";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<any>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    try {
      const promises: Promise<any>[] = [];

      if (searchType === "all" || searchType === "threads") {
        promises.push(searchThreadsAction(query));
      }
      if (searchType === "all" || searchType === "messages") {
        promises.push(searchMessagesAction(query));
      }
      if (searchType === "all" || searchType === "users") {
        promises.push(searchUsersAction(query));
      }

      const searchResults = await Promise.all(promises);
      setResults({
        threads: searchResults[0]?.data || null,
        messages: searchResults[1]?.data || null,
        users: searchResults[2]?.data || null,
      });
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3 mb-6">
          <Search className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Search</h1>
        </div>

        <Card className="p-6 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search threads, messages, or users..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="flex-1"
            />
            <Button onClick={handleSearch} disabled={isSearching}>
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>

          <div className="flex gap-2">
            {(["all", "threads", "messages", "users"] as SearchType[]).map(
              (type) => (
                <Button
                  key={type}
                  variant={searchType === type ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSearchType(type)}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              )
            )}
          </div>
        </Card>

        {results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {results.threads && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Threads ({results.threads.total || 0})
                </h2>
                <div className="grid gap-4">
                  {results.threads.threads?.map((thread: any) => (
                    <Link
                      key={thread.id}
                      href={`/dashboard/threads/thread/${thread.slug}`}
                    >
                      <Card className="p-4 hover:bg-accent transition-colors">
                        <h3 className="font-semibold">{thread.name}</h3>
                        {thread.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {thread.description}
                          </p>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {results.messages && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Messages ({results.messages.total || 0})
                </h2>
                <div className="grid gap-4">
                  {results.messages.messages?.map((message: any) => (
                    <Link
                      key={message.id}
                      href={`/dashboard/threads/thread/${message.section.slug}`}
                    >
                      <Card className="p-4 hover:bg-accent transition-colors">
                        <p className="text-sm">{message.content}</p>
                        <p className="text-xs text-muted-foreground mt-2">
                          by {message.sender.name || message.sender.email} in{" "}
                          {message.section.name}
                        </p>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {results.users && (
              <div>
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Users ({results.users.total || 0})
                </h2>
                <div className="grid gap-4">
                  {results.users.users?.map((user: any) => (
                    <Link
                      key={user.id}
                      href={`/user/${user.id}`}
                    >
                      <Card className="p-4 hover:bg-accent transition-colors">
                        <h3 className="font-semibold">
                          {user.name || user.email}
                        </h3>
                        {user.bio && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {user.bio}
                          </p>
                        )}
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

