'use server';

import { getEnv } from '@/lib/config/env';
import { logger } from '@/lib/infrastructure/logger';
import { enqueueJob } from '@/lib/services/queue';
import { AIJobType } from '@/lib/queue/config';
import { getResendClient } from '@/lib/config/resend';
import type { CreateEmailOptions } from 'resend';
import type { EmailJobData } from '@/lib/queue/types';

const env = getEnv();

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  from?: string;
  type?: string;
  metadata?: Record<string, unknown>;
  templateId?: string;
  data?: Record<string, string>;
}

async function enqueueEmailJob(payload: EmailJobData) {
  await enqueueJob('email', payload as unknown as Record<string, unknown>);

  logger.info(
    `Queued email job (${payload.type || 'email'}) for ${Array.isArray(payload.to) ? payload.to.join(', ') : payload.to}`
  );

  return { id: `email-${Date.now()}` };
}

export async function sendEmail({
  to,
  subject,
  text,
  from = env.RESEND_FROM,
  type = 'generic',
  metadata,
  templateId,
  data,
}: EmailOptions) {
  const job = await enqueueEmailJob({
    to,
    subject,
    text,
    from,
    type,
    metadata,
    templateId,
    data,
  });

  return { id: String(job.id) };
}

export async function sendEmailNow({
  to,
  subject,
  text,
  from = env.RESEND_FROM,
  templateId,
  data,
}: EmailJobData) {
  try {
    const resend = getResendClient();
    const toAddresses = Array.isArray(to) ? to : [to];

    // In non-production, Resend's test key only permits its own verification
    // address, so real recipients (e.g. example.com) hard-fail with a 422.
    // Skip the actual send in dev to avoid noisy job failures; the email is
    // still "enqueued" and logged so the flow can be exercised end-to-end.
    if (process.env.NODE_ENV !== 'production') {
      logger.info(
        `[email] Skipping real send in non-production to ${toAddresses.join(', ')} (subject: ${subject})`
      );
      return { id: 'dev-noop' };
    }


    const baseOpts = { from, to: toAddresses, subject };

    const payload: CreateEmailOptions = templateId && data
      ? { ...baseOpts, template: { id: templateId, variables: data } }
      : { ...baseOpts, text: text ?? '' };

    const { data: result, error } = await resend.emails.send(payload);

    if (error) {
      logger.error('Resend API error', error);
      throw new Error(error.message);
    }

    logger.info(
      `Email sent successfully to ${toAddresses.join(', ')} (id: ${result?.id})`
    );

    return { id: result?.id || 'unknown' };
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

  return sendEmail({
    to,
    subject: config.subject,
    type: `otp-${type}`,
    metadata: { otpType: type },
    templateId: env.RESEND_TEMPLATE_OTP,
    data: {
      title: config.title,
      subtitle: config.subtitle,
      action: config.action,
      otp,
      appUrl: env.NEXT_PUBLIC_APP_URL,
    },
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
  return sendEmail({
    to,
    subject: `Thread Digest: ${threadName}`,
    type: 'newsletter-digest',
    metadata: { threadName, threadUrl },
    templateId: env.RESEND_TEMPLATE_THREAD_SUMMARY,
    data: {
      threadName,
      summary,
      threadUrl,
      messageCount: String(messageCount || 0),
      participantCount: String(participantCount || 0),
      managePreferencesUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=newsletters`,
    },
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  return sendEmail({
    to,
    subject: 'Welcome to Sastram!',
    type: 'welcome',
    metadata: { name },
    templateId: env.RESEND_TEMPLATE_WELCOME,
    data: {
      name,
      dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
    },
  });
}

export async function sendMentionNotification(
  to: string,
  mentionerName: string,
  threadName: string,
  messagePreview: string,
  threadUrl: string
) {
  return sendEmail({
    to,
    subject: `${mentionerName} mentioned you in ${threadName}`,
    type: 'mention-notification',
    metadata: { mentionerName, threadName, threadUrl },
    text: `${mentionerName} mentioned you in ${threadName}: ${messagePreview} — ${threadUrl}`,
  });
}

export async function sendFollowNotification(
  to: string,
  followerName: string,
  followerUrl: string
) {
  return sendEmail({
    to,
    subject: `${followerName} started following you`,
    type: 'follow-notification',
    metadata: { followerName, followerUrl },
    text: `${followerName} started following you — ${followerUrl}`,
  });
}

export async function sendThreadInvitation(
  to: string,
  inviterName: string,
  threadName: string,
  message: string | null,
  threadUrl: string
) {
  return sendEmail({
    to,
    subject: `${inviterName} invited you to join ${threadName}`,
    type: 'thread-invitation',
    metadata: { inviterName, threadName, threadUrl },
    templateId: env.RESEND_TEMPLATE_INVITATION,
    data: {
      inviterName,
      threadName,
      message: message || "You've been invited to join this discussion!",
      threadUrl,
    },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  return sendEmail({
    to,
    subject: 'Reset your password',
    type: 'password-reset',
    metadata: { resetUrl },
    templateId: env.RESEND_TEMPLATE_PASSWORD_RESET,
    data: {
      resetUrl,
    },
  });
}
