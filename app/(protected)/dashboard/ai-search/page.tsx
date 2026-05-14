import type { Metadata } from 'next';
import { SearchPage } from '@/components/ai-search/SearchPage';

export const metadata: Metadata = {
  title: 'AI Search — Sastram',
  description:
    'Search across Reddit, Hacker News, ArchWiki, Stack Overflow and more with AI-powered synthesis.',
};

export default function AISearchPage() {
  return <SearchPage />;
}
