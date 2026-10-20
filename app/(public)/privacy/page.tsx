import { Lock } from 'lucide-react';
import { SerifHeading } from '@/components/layout/serif-heading';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Sastram',
  description: 'How Sastram collects, uses, and protects your data.',
};

const sections = [
  {
    title: '1. What we collect',
    body: [
      'Account details: your name, email address, and profile image (for example, the image returned by an OAuth provider when you sign in with Google or GitHub).',
      'Content you create: threads, messages, edits, reactions, polls, bookmarks, reports, and other activity you perform while signed in.',
      'Technical data: IP address, user agent, and session timestamps used for authentication, rate limiting, and abuse prevention.',
      'AI inputs: the prompt or thread content you submit when you use an AI feature such as @sai replies or AI search.',
    ],
  },
  {
    title: '2. How we use it',
    body: [
      'To operate Sastram: authenticate you, show your threads and messages, deliver notifications, and send email you request such as digests and invitations.',
      'To keep discussions safe: run moderation rules, process reports and appeals, and enforce bans.',
      'To provide AI features: generate summaries, search results, and replies when you ask for them.',
      'To secure the service: detect abuse, enforce quotas, and diagnose errors.',
    ],
  },
  {
    title: '3. AI features and your content',
    body: [
      'When you use an AI feature, the relevant content is sent to the model provider configured for this deployment (currently Google Gemini or OpenAI) and, for search, to the configured search provider (Exa or Tavily).',
      'AI features are optional. If you never use @sai, AI search, or automatic summaries, your content is not sent to those providers for AI processing.',
      'We do not use your content to train our own models.',
    ],
  },
  {
    title: '4. Cookies and sessions',
    body: [
      'We use a session cookie to keep you signed in. It is required for the service to work.',
      'We do not run advertising or third-party tracking cookies.',
    ],
  },
  {
    title: '5. Service providers',
    body: [
      'Sastram relies on infrastructure providers to run the service, which may include hosting (Vercel), database (PostgreSQL, for example Neon), Redis and job queues (Upstash), email delivery (Resend), and authentication infrastructure (Better Auth).',
      'These providers process data only as needed to provide their service to Sastram.',
    ],
  },
  {
    title: '6. Retention and deletion',
    body: [
      'You can download a copy of your data or delete your account at any time from Settings → Account. Deletion is a soft delete: you are signed out immediately, and your data is anonymized and permanently purged within 30 days.',
      'Some records may be retained longer where necessary for security, abuse prevention, or legal obligations.',
    ],
  },
  {
    title: '7. Your choices',
    body: [
      'You can edit your profile, change your privacy settings, control thread subscriptions, and choose how often you receive digest emails from Settings.',
      'You can stop using AI features at any time by not invoking them.',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <main className="py-16 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand/10 text-brand text-sm font-medium mb-6">
          <Lock size={16} />
          <span>Privacy</span>
        </div>

        <SerifHeading
          as="h1"
          className="text-4xl md:text-5xl tracking-tight text-foreground mb-6 block"
        >
          Privacy Policy
        </SerifHeading>

        <p className="text-lg text-muted-foreground mb-12">Last updated: October 2026</p>

        <div className="space-y-8">
          {sections.map((section) => (
            <section key={section.title} className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-muted-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}

          <section className="space-y-4">
            <h2 className="text-xl font-semibold text-foreground">8. Contact</h2>
            <p className="text-muted-foreground leading-relaxed">
              Questions about this policy? Open an issue in the{' '}
              <a
                href="https://github.com/pulkit777exe/sastram/issues"
                target="_blank"
                rel="noreferrer"
                className="text-brand hover:underline"
              >
                Sastram repository
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
