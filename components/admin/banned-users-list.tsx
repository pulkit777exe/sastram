"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils/cn";

export interface BannedUser {
  id: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
    status: string;
  };
  bannedBy: {
    name: string | null;
  };
  reason: string;
  status: "BANNED" | "SUSPENDED";
  createdAt: Date;
  expiresAt: Date | null;
  isActive: boolean;
}

interface BannedUsersListProps {
  bans: BannedUser[];
}

export function BannedUsersList({ bans }: BannedUsersListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");

  // Helper for safe client-side date calculation
  const getDaysRemaining = (expiresAt: Date) => {
    return Math.ceil(
      (new Date(expiresAt).getTime() - new Date().getTime()) /
        (1000 * 60 * 60 * 24)
    );
  };

  const filteredBans = bans.filter((ban) => {
    const matchesSearch =
      (ban.user.name?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
      ban.reason.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filter === "all"
        ? true
        : filter === "permanent"
        ? !ban.expiresAt
        : filter === "temporary"
        ? !!ban.expiresAt
        : true;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="relative w-full sm:w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search user or reason"
            className="pl-9 bg-muted border-border"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Filter:
          </span>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Bans</SelectItem>
              <SelectItem value="permanent">Permanent</SelectItem>
              <SelectItem value="temporary">Temporary</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 border-border hover:bg-muted/50">
              <TableHead>User</TableHead>
              <TableHead>Ban Date</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Banned By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredBans.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No banned users found
                </TableCell>
              </TableRow>
            ) : (
              filteredBans.map((ban) => (
                <TableRow key={ban.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={ban.user.image || undefined} />
                        <AvatarFallback>
                          {ban.user.name?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {ban.user.name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {ban.user.email}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(ban.createdAt), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell className="text-sm">{ban.reason}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ban.bannedBy.name || "System"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-normal",
                        !ban.expiresAt
                          ? "bg-red-500/10 text-red-500 border-red-500/20"
                          : "bg-orange-500/10 text-orange-500 border-orange-500/20"
                      )}
                    >
                      {!ban.expiresAt
                        ? "Permanent"
                        : `Temporary (${getDaysRemaining(
                            ban.expiresAt!
                          )} days)`}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                      >
                        [View Appeal]
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        [Unban]
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
