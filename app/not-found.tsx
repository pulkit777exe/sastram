'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PublicNavbar } from '@/components/layout/public-navbar';
import { PublicFooter } from '@/components/layout/public-footer';
import { SerifHeading } from '@/components/layout/serif-heading';

export default function NotFound() {
  const router = useRouter();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <PublicNavbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="space-y-2">
            <SerifHeading as="h1" className="text-8xl font-bold text-brand block">
              404
            </SerifHeading>
            <div className="h-1 w-24 mx-auto bg-brand/30 rounded-full" />
          </div>

          <div className="space-y-3">
            <h2 className="text-2xl font-bold tracking-tight">Page Not Found</h2>
            <p className="text-muted-foreground text-sm leading-relaxed">
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
              <Link href="/dashboard">
                <Home className="w-4 h-4 mr-2" />
                Go to Dashboard
              </Link>
            </Button>
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </div>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
