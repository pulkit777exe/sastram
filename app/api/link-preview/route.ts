import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ok, fail, withErrorHandling, HTTP_STATUS } from '@/lib/utils/api-response';
import { isSafePublicUrl } from '@/lib/services/content-safety';

const querySchema = z.object({ url: z.string().url() });

function toAbsoluteUrl(src: string, baseUrl: string): string {
  try {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
      return src.startsWith('//') ? `https:${src}` : src;
    }
    return new URL(src, baseUrl).toString();
  } catch {
    return src;
  }
}

function parseOg(html: string, url: string) {
  const get = (re: RegExp) => {
    const m = html.match(re);
    return m?.[1]?.trim() ? m[1].trim().slice(0, 300) : null;
  };
  const getAll = (re: RegExp) => {
    const out: string[] = [];
    let m: RegExpExecArray | null;
    const cloned = new RegExp(re.source, re.flags);
    while ((m = cloned.exec(html)) !== null) {
      const v = m[1]?.trim();
      if (v && !out.includes(v) && out.length < 6) out.push(v);
    }
    return out;
  };
  // More flexible: content before property or property before content
  const title =
    get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) ||
    get(/<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<title[^>]*>([^<]+)<\/title>/i);
  const description =
    get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
    get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i);
  const image =
    get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    get(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
    get(/<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i);
  const images = getAll(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|og:image:secure_url)["'][^>]+content=["']([^"']+)["']/gi).slice(0, 4);
  if (image && !images.includes(image)) images.unshift(image);
  // Try JSON-LD image
  const jsonLdImgs = getAll(/"image"\s*:\s*"([^"]+)"/gi).filter((u) => u.startsWith('http')).slice(0, 2);
  for (const ji of jsonLdImgs) {
    const abs = toAbsoluteUrl(ji, url);
    if (!images.includes(abs) && images.length < 4) images.push(abs);
  }
  // Content images as last resort
  const contentImgs = getAll(/<img[^>]+src=["']([^"']+)["']/gi)
    .map((u) => toAbsoluteUrl(u, url))
    .filter((u) => u.startsWith('http') && !u.includes('avatar') && !u.includes('logo') && !u.includes('icon') && u.length < 500)
    .slice(0, 3);
  for (const ci of contentImgs) if (!images.includes(ci) && images.length < 4) images.push(ci);
  let domain = '';
  try {
    domain = new URL(url).hostname.replace(/^www\./, '');
  } catch {}
  const absImages = images.map((u) => toAbsoluteUrl(u, url)).filter((u) => u.startsWith('http')).slice(0, 3);
  return { title: title || domain || url, description: description || null, image: absImages[0] || image || null, images: absImages.slice(0, 3), domain, url };
}

export const GET = withErrorHandling(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const rawUrl = searchParams.get('url');
  const parsed = querySchema.safeParse({ url: rawUrl });
  if (!parsed.success) return NextResponse.json(fail('VALIDATION_ERROR', 'url must be a valid http/https URL'), { status: HTTP_STATUS.BAD_REQUEST });
  const url = parsed.data.url;
  if (!isSafePublicUrl(url)) return NextResponse.json(fail('VALIDATION_ERROR', 'URL must be public'), { status: HTTP_STATUS.BAD_REQUEST });

  let exaTitle: string | null = null;
  let exaDescription: string | null = null;
  let exaImage: string | null = null;
  const exaKey = process.env.SASTRAM_EXA_KEY;
  if (exaKey) {
    try {
      const res = await fetch('https://api.exa.ai/contents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': exaKey },
        body: JSON.stringify({ urls: [url], text: { maxCharacters: 8000 }, livecrawl: 'preferred' }),
      });
      if (res.ok) {
        const json = await res.json() as { results?: Array<{ title?: string; url?: string; text?: string; image?: string }> };
        const r = json.results?.[0];
        if (r?.title) exaTitle = r.title.slice(0, 120);
        if (r?.text) exaDescription = r.text.slice(0, 280);
        const maybeImg = (r as unknown as { image?: string })?.image;
        if (maybeImg) exaImage = maybeImg;
      }
    } catch {
      // fall through
    }
  }

  try {
    // Use manual redirect to validate final destination and prevent SSRF via redirect to private IP/localhost
    const res = await fetch(url, {
      headers: { 'User-Agent': 'SastramBot/1.0 (+https://sastram.wtfpulkit.dev)', Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    // Handle redirect manually: validate Location header before following
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (location) {
        let redirectUrl: string;
        try {
          redirectUrl = new URL(location, url).toString();
        } catch {
          return NextResponse.json(fail('VALIDATION_ERROR', 'Invalid redirect URL'), { status: HTTP_STATUS.BAD_REQUEST });
        }
        if (!isSafePublicUrl(redirectUrl)) {
          return NextResponse.json(fail('VALIDATION_ERROR', 'Redirect to private URL blocked'), { status: HTTP_STATUS.BAD_REQUEST });
        }
        // Safe redirect — follow once with validation on final URL
        const finalRes = await fetch(redirectUrl, {
          headers: { 'User-Agent': 'SastramBot/1.0 (+https://sastram.wtfpulkit.dev)', Accept: 'text/html,application/xhtml+xml' },
          signal: AbortSignal.timeout(5000),
          redirect: 'follow',
        });
        if (!finalRes.ok) throw new Error(`fetch ${finalRes.status}`);
        if (finalRes.url && !isSafePublicUrl(finalRes.url)) {
          return NextResponse.json(fail('VALIDATION_ERROR', 'Redirect to private URL blocked'), { status: HTTP_STATUS.BAD_REQUEST });
        }
        const html = await finalRes.text();
        const og = parseOg(html.slice(0, 25000), finalRes.url || redirectUrl);
        if (exaTitle) og.title = exaTitle;
        if (exaDescription) og.description = exaDescription;
        if (exaImage && !og.images.includes(exaImage)) og.images.unshift(exaImage);
        if (exaImage && !og.image) og.image = exaImage;
        return NextResponse.json(ok(og));
      }
    }
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    // For non-redirect follow chains, fetch already validated initial URL; also verify final res.url if redirected via follow edge
    if (res.url && res.url !== url && !isSafePublicUrl(res.url)) {
      return NextResponse.json(fail('VALIDATION_ERROR', 'Redirect to private URL blocked'), { status: HTTP_STATUS.BAD_REQUEST });
    }
    const html = await res.text();
    const og = parseOg(html.slice(0, 25000), res.url || url);
    // Merge Exa data (better text) with OG images
    if (exaTitle) og.title = exaTitle;
    if (exaDescription) og.description = exaDescription;
    if (exaImage && !og.images.includes(exaImage)) og.images.unshift(exaImage);
    if (exaImage && !og.image) og.image = exaImage;
    return NextResponse.json(ok(og));
  } catch {
    let domain = '';
    try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
    if (exaTitle || exaDescription) {
      return NextResponse.json(ok({ title: exaTitle || domain || url, description: exaDescription, image: exaImage, images: exaImage ? [exaImage] : [], domain, url }));
    }
    return NextResponse.json(ok({ title: domain || url, description: null, image: null, images: [], domain, url }));
  }
});
