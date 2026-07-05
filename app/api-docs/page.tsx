'use client';

import { useEffect, useState } from 'react';
import { PublicNavbar } from '@/components/layout/public-navbar';
import { PublicFooter } from '@/components/layout/public-footer';
import sanitizeHtml from 'sanitize-html';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: sanitizeHtml.defaults.allowedTags.concat([
    'style', 'link', 'meta', 'script',
  ]),
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    '*': ['class', 'id', 'style', 'data-*'],
  },
  allowedSchemes: ['https', 'http', 'data'],
};

export default function ApiDocsPage() {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/docs')
      .then((res) => res.text())
      .then((raw) => setHtml(sanitizeHtml(raw, SANITIZE_OPTIONS)))
      .catch(console.error);
  }, []);

  if (!html) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        <PublicNavbar />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Loading API documentation...</p>
        </div>
        <PublicFooter />
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
