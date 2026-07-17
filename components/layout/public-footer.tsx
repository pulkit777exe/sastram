import Link from 'next/link';
import Image from 'next/image';
import { SerifHeading } from '@/components/layout/serif-heading';

export function PublicFooter() {
  return (
    <footer className="bg-brand text-white">
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-10">
        <SerifHeading as="h2" className="text-4xl md:text-6xl tracking-tight mb-16 leading-[1.1] block">
          Imagine a world with better discussions
        </SerifHeading>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16 text-[13px]">
          <div>
            <p className="font-semibold mb-3 text-white/90">Product</p>
            <div className="space-y-2 text-white/60">
              <Link href="/#features" className="block hover:text-white transition-colors">
                Features
              </Link>
              <Link href="/pricing" className="block hover:text-white transition-colors">
                Pricing
              </Link>
              <Link href="/#how-it-works" className="block hover:text-white transition-colors">
                How it works
              </Link>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-3 text-white/90">Platform</p>
            <div className="space-y-2 text-white/60">
              <Link href="/api-docs" className="block hover:text-white transition-colors">
                API docs
              </Link>
              <Link href="/login" className="block hover:text-white transition-colors">
                Sign in
              </Link>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-3 text-white/90">Legal</p>
            <div className="space-y-2 text-white/60">
              <Link href="/terms" className="block hover:text-white transition-colors">
                Terms
              </Link>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-3 text-white/90">Stack</p>
            <div className="space-y-2 text-white/60">
              <span className="block">Next.js 16</span>
              <span className="block">Prisma + PostgreSQL</span>
              <span className="block">Upstash Redis + QStash</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t border-white/20">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Sastram"
              width={18}
              height={18}
              className="rounded brightness-0 invert"
              style={{ width: 'auto', height: 'auto' }}
            />
            <span className="font-semibold text-sm">Sastram</span>
          </div>
          <p className="text-[12px] text-white/50">&copy; 2026 Sastram. Open source.</p>
        </div>
      </div>
    </footer>
  );
}
