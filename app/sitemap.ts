import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  const today = new Date();
  const iso = today.toISOString();

  return [
    { url: `${siteUrl}/`, lastModified: iso, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/pricing`, lastModified: iso, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/privacy`, lastModified: iso, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${siteUrl}/terms`, lastModified: iso, changeFrequency: 'yearly', priority: 0.3 },
  ];
}