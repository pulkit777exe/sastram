'use client';

import { useEffect, useState } from 'react';

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<string | null>(null);

  useEffect(() => {
    fetch('/openapi.json')
      .then(res => res.json())
      .then(data => setSpec(JSON.stringify(data, null, 2)))
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Sastram API Documentation</h1>
        <p className="text-gray-600 mb-8">
          This is the API documentation for the Sastram forum application.
          The full OpenAPI specification is available below.
        </p>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">OpenAPI Spec</h2>
          {spec ? (
            <pre className="bg-gray-100 p-4 rounded overflow-x-auto text-sm">
              {spec.substring(0, 2000)}...
            </pre>
          ) : (
            <p className="text-gray-500">Loading specification...</p>
          )}
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Base URL</h3>
            <code className="bg-gray-100 px-2 py-1 rounded">http://localhost:3000/api</code>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-2">Authentication</h3>
            <p className="text-gray-600 text-sm">JWT Bearer tokens for protected endpoints</p>
          </div>
        </div>
      </div>
    </div>
  );
}