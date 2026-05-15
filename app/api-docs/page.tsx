'use client';

import { useEffect, useState } from 'react';

export default function ApiDocsPage() {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/docs')
      .then((res) => res.text())
      .then(setHtml)
      .catch(console.error);
  }, []);

  if (!html) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading API documentation...</p>
      </div>
    );
  }

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
