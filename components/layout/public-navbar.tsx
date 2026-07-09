'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface PublicNavbarUser {
  name: string | null;
  email: string;
  image: string | null;
}

interface PublicNavbarProps {
  user?: PublicNavbarUser | null;
}

export function PublicNavbar({ user = null }: PublicNavbarProps) {
  const { theme } = useTheme();
  const [logoSrc, setLogoSrc] = useState('/sastram-image-light.png');
  const userInitial = user?.name?.[0] || user?.email?.[0] || 'U';

  useEffect(() => {
    setLogoSrc(theme === 'dark' ? '/sastram-image-dark.png' : '/sastram-image-light.png');
  }, [theme]);

  return (
    <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Image src={logoSrc} alt="Sastram" width={22} height={22} priority sizes="22px" className="rounded-md" />
          <span className="font-semibold tracking-tight text-foreground">Sastram</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7">
          <Link
            href="/#features"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            href="/#how-it-works"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </Link>
          <Link
            href="/pricing"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
          <Link
            href="/api-docs"
            className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            API
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user ? (
            <Link href="/dashboard" className="flex items-center gap-2">
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
                className="text-[13px] font-medium px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all"
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
