import { Resend } from "resend";
import { getEnv } from "@/lib/config/env";
import { logger } from "@/lib/infrastructure/logger";
import fs from "fs/promises";
import path from "path";

const env = getEnv();
const resend = new Resend(process.env.RESEND_API_KEY);

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
  from = "Sastram <noreply@resend.com>",
}: EmailOptions) {
  try {
    const { data, error } = await resend.emails.send({
      from,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, ""),
    });

    if (error) {
      logger.error("Failed to send email:", error);
      throw new Error(`Email sending failed: ${error.message}`);
    }

    logger.info(
      `Email sent successfully to ${Array.isArray(to) ? to.join(", ") : to}`
    );
    return data;
  } catch (error) {
    logger.error("Error sending email:", error);
    throw error;
  }
}

export async function sendOTPEmail(
  to: string,
  otp: string,
  type: "sign-in" | "email-verification" | "forget-password"
) {
  const typeConfig = {
    "sign-in": {
      title: "Sign In to Sastram",
      subtitle: "Your one-time password is ready",
      action: "sign in",
      subject: "Your Sastram Sign-In Code",
    },
    "email-verification": {
      title: "Verify Your Email",
      subtitle: "Confirm your email address",
      action: "email verification",
      subject: "Verify Your Sastram Email",
    },
    "forget-password": {
      title: "Reset Your Password",
      subtitle: "Password recovery request",
      action: "password reset",
      subject: "Reset Your Sastram Password",
    },
  };

  const config = typeConfig[type];
  const html = await loadTemplate("otp-email.html", {
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
  const html = await loadTemplate("newsletter-digest.html", {
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
  });
}

export async function sendWelcomeEmail(to: string, name: string) {
  const html = await loadTemplate("welcome.html", {
    name,
    dashboardUrl: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
  });

  return sendEmail({
    to,
    subject: "Welcome to Sastram!",
    html,
  });
}

export async function sendMentionNotification(
  to: string,
  mentionerName: string,
  threadName: string,
  messagePreview: string,
  threadUrl: string
) {
  const html = await loadTemplate("mention-notification.html", {
    mentionerName,
    threadName,
    messagePreview,
    threadUrl,
  });

  return sendEmail({
    to,
    subject: `${mentionerName} mentioned you in ${threadName}`,
    html,
  });
}

export async function sendFollowNotification(
  to: string,
  followerName: string,
  followerUrl: string
) {
  const html = await loadTemplate("follow-notification.html", {
    followerName,
    followerUrl,
  });

  return sendEmail({
    to,
    subject: `${followerName} started following you`,
    html,
  });
}

export async function sendThreadInvitation(
  to: string,
  inviterName: string,
  threadName: string,
  message: string | null,
  threadUrl: string
) {
  const html = await loadTemplate("thread-invitation.html", {
    inviterName,
    threadName,
    message: message || "You've been invited to join this discussion!",
    threadUrl,
  });

  return sendEmail({
    to,
    subject: `${inviterName} invited you to join ${threadName}`,
    html,
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const html = await loadTemplate("password-reset.html", {
    resetUrl,
  });

  return sendEmail({
    to,
    subject: "Reset your password",
    html,
  });
}

async function loadTemplate(
  templateName: string,
  variables: Record<string, string>
): Promise<string> {
  try {
    const templatePath = path.join(
      process.cwd(),
      "lib",
      "templates",
      "email",
      templateName
    );
    let html = await fs.readFile(templatePath, "utf-8");

    // Replace variables in template
    for (const [key, value] of Object.entries(variables)) {
      html = html.replace(new RegExp(`{{${key}}}`, "g"), value);
    }

    return html;
  } catch (error) {
    logger.error(`Failed to load email template ${templateName}:`, error);
    // Return a simple fallback template
    return generateFallbackTemplate(templateName, variables);
  }
}

function generateFallbackTemplate(
  templateName: string,
  variables: Record<string, string>
): string {
  // Simple fallback HTML templates
  const templates: Record<string, (vars: Record<string, string>) => string> = {
    "newsletter-digest.html": (vars) => `
      <h1>Daily Digest: ${vars.threadName}</h1>
      <p>${vars.summary}</p>
      <a href="${vars.threadUrl}">View Thread</a>
      <p><a href="${vars.unsubscribeUrl}">Unsubscribe</a></p>
    `,
    "welcome.html": (vars) => `
      <h1>Welcome to Sastram, ${vars.name}!</h1>
      <p>Get started by exploring our communities and threads.</p>
      <a href="${vars.dashboardUrl}">Go to Dashboard</a>
    `,
    "mention-notification.html": (vars) => `
      <h1>You were mentioned!</h1>
      <p>${vars.mentionerName} mentioned you in "${vars.threadName}"</p>
      <p>${vars.messagePreview}</p>
      <a href="${vars.threadUrl}">View Message</a>
    `,
    "follow-notification.html": (vars) => `
      <h1>New Follower</h1>
      <p>${vars.followerName} started following you.</p>
      <a href="${vars.followerUrl}">View Profile</a>
    `,
    "thread-invitation.html": (vars) => `
      <h1>Thread Invitation</h1>
      <p>${vars.inviterName} invited you to join "${vars.threadName}"</p>
      <p>${vars.message}</p>
      <a href="${vars.threadUrl}">Join Thread</a>
    `,
    "password-reset.html": (vars) => `
      <h1>Reset Your Password</h1>
      <p>Click the link below to reset your password:</p>
      <a href="${vars.resetUrl}">Reset Password</a>
    `,
  };

  const template = templates[templateName] || (() => "<p>Email content</p>");
  return `<!DOCTYPE html><html><body>${template(variables)}</body></html>`;
}
