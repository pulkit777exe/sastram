import nodemailer from 'nodemailer';
import fs from 'fs/promises';
import path from 'path';
import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';
import { DEFAULT_JOB_OPTIONS, getEmailQueue, type EmailJobData } from '@/lib/infrastructure/bullmq';

const env = getEnv();

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
});

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

async function enqueueEmailJob(payload: EmailJobData) {
  const emailQueue = getEmailQueue();
  const job = await emailQueue.add(payload.type || 'email', payload, DEFAULT_JOB_OPTIONS);

  logger.info(
    `Queued email job ${job.id} (${payload.type || 'email'}) for ${Array.isArray(payload.to) ? payload.to.join(', ') : payload.to}`
  );

  return job;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = env.SMTP_FROM,
  type = 'generic',
  metadata,
}: EmailOptions) {
  const job = await enqueueEmailJob({
    to,
    subject,
    html,
    text,
    from,
    type,
    metadata,
  });

  return { id: String(job.id) };
}

export async function sendEmailNow({
  to,
  subject,
  html,
  text,
  from = env.SMTP_FROM,
}: EmailJobData) {
  try {
    const info = await transporter.sendMail({
      from,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ''),
    });

    logger.info(
      `Email sent successfully to ${Array.isArray(to) ? to.join(', ') : to} (messageId: ${info.messageId})`
    );

    return { id: info.messageId };
  } catch (error) {
    logger.error('Error sending email', error);
    throw error;
  }
}

export async function sendOTPEmail(
  to: string,
  otp: string,
  type: 'sign-in' | 'email-verification' | 'forget-password' | 'change-email'
) {
  const typeConfig = {
    'sign-in': {
      title: 'Sign In to Sastram',
      subtitle: 'Your one-time password is ready',
      action: 'sign in',
      subject: 'Your Sastram Sign-In Code',
    },
    'email-verification': {
      title: 'Verify Your Email',
      subtitle: 'Confirm your email address',
      action: 'email verification',
      subject: 'Verify Your Sastram Email',
    },
    'forget-password': {
      title: 'Reset Your Password',
      subtitle: 'Password recovery request',
      action: 'password reset',
      subject: 'Your Sastram password reset code',
    },
    'change-email': {
      title: 'Update Your Email',
      subtitle: 'Email change request',
      action: 'email change',
      subject: 'Verify Your Sastram Email Change',
    },
  };

  const config = typeConfig[type];
  const html = await loadTemplate('otp-email.html', {
    title: config.title,
    subtitle: config.subtitle,
    action: config.action,
    otp,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });

  return sendEmail({
    to,
    subject: config.subject,
    html,
    type: `otp-${type}`,
    metadata: { otpType: type },
  });
}

export async function sendNewsletterDigest(
  to: string,
  threadName: string,
  summary: string,
  threadUrl: string,
  messageCount?: number,
  participantCount?: number
) {
  const html = await loadTemplate('newsletter-digest.html', {
    threadName,
    summary,
    threadUrl,
    messageCount: String(messageCount || 0),
    participantCount: String(participantCount || 0),
    unsubscribeUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=newsletters`,
  });

  return sendEmail({
    to,
    subject: `Thread Digest: ${threadName}`,
    html,
    type: 'newsletter-digest',
    metadata: { threadName, threadUrl },
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  const html = await loadTemplate('welcome.html', {
    name,
    dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
  });

  return sendEmail({
    to,
    subject: 'Welcome to Sastram!',
    html,
    type: 'welcome',
    metadata: { name },
  });
}

export async function sendMentionNotification(
  to: string,
  mentionerName: string,
  threadName: string,
  messagePreview: string,
  threadUrl: string
) {
  const html = await loadTemplate('mention-notification.html', {
    mentionerName,
    threadName,
    messagePreview,
    threadUrl,
  });

  return sendEmail({
    to,
    subject: `${mentionerName} mentioned you in ${threadName}`,
    html,
    type: 'mention-notification',
    metadata: { mentionerName, threadName, threadUrl },
  });
}

export async function sendFollowNotification(
  to: string,
  followerName: string,
  followerUrl: string
) {
  const html = await loadTemplate('follow-notification.html', {
    followerName,
    followerUrl,
  });

  return sendEmail({
    to,
    subject: `${followerName} started following you`,
    html,
    type: 'follow-notification',
    metadata: { followerName, followerUrl },
  });
}

export async function sendThreadInvitation(
  to: string,
  inviterName: string,
  threadName: string,
  message: string | null,
  threadUrl: string
) {
  const html = await loadTemplate('thread-invitation.html', {
    inviterName,
    threadName,
    message: message || "You've been invited to join this discussion!",
    threadUrl,
  });

  return sendEmail({
    to,
    subject: `${inviterName} invited you to join ${threadName}`,
    html,
    type: 'thread-invitation',
    metadata: { inviterName, threadName, threadUrl },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const html = await loadTemplate('password-reset.html', {
    resetUrl,
  });

  return sendEmail({
    to,
    subject: 'Reset your password',
    html,
    type: 'password-reset',
    metadata: { resetUrl },
  });
}

async function loadTemplate(
  templateName: string,
  variables: Record<string, string>
): Promise<string> {
  try {
    const templatePath = path.join(process.cwd(), 'lib', 'templates', 'email', templateName);
    let html = await fs.readFile(templatePath, 'utf-8');

    for (const [key, value] of Object.entries(variables)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return html;
  } catch (error) {
    logger.error(`Failed to load email template: ${templateName}`, error);
    throw error;
  }
}
