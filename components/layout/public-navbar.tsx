'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

interface PublicNavbarUser {
  name: string | null;
  email: string;
  image: string | null;
}

interface PublicNavbarProps {
  user?: PublicNavbarUser | null;
}

const NAV_LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/api-docs', label: 'API' },
];

export function PublicNavbar({ user = null }: PublicNavbarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const userInitial = user?.name?.[0] || user?.email?.[0] || 'U';

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" aria-label="Sastram home">
          <Logo brand className="h-6 w-6 shrink-0" />
          <span className="font-semibold tracking-tight text-foreground">Sastram</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden md:flex items-center gap-7">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {/* Mobile hamburger */}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <button
                className="md:hidden flex items-center justify-center h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu size={18} />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <nav className="flex flex-col p-4 pt-14 gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setSheetOpen(false)}
                    className="px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="my-3 h-px bg-border" />
                {user ? (
                  <Link
                    href="/dashboard"
                    onClick={() => setSheetOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user.image || undefined} />
                      <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                    Dashboard
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/login"
                      onClick={() => setSheetOpen(false)}
                      className="px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/login"
                      onClick={() => setSheetOpen(false)}
                      className="mx-3 mt-1 px-4 py-2.5 text-sm font-medium text-center bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all"
                    >
                      Get started
                    </Link>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Desktop auth actions */}
          {user ? (
            <Link href="/dashboard" className="hidden md:flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={user.image || undefined} />
                <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors hidden sm:block px-3 py-1.5"
              >
                Sign in
              </Link>
              <Link
                href="/login"
                className="hidden md:inline-flex text-[13px] font-medium px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all"
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
