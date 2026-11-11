import { ImageResponse } from 'next/og';
import { getPublicThreadBySlug } from '@/lib/public-content/thread';

export const alt = 'Sastram discussion';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const thread = await getPublicThreadBySlug(slug);
  const title = thread?.name ?? 'Sastram';
  const subtitle = thread?.verifiedAt ? 'Verified public discussion' : 'Public discussion';
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px',
          background: '#0f1115',
          color: '#f5f7fb',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 28, opacity: 0.8 }}>Sastram</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', fontSize: 60, lineHeight: 1.15, fontWeight: 700 }}>{title.slice(0, 110)}</div>
          <div style={{ display: 'flex', fontSize: 30, opacity: 0.85 }}>{subtitle}</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
