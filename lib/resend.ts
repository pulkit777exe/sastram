import { Resend } from 'resend';

const resend = new Resend(process.env.NEXT_PUBLIC_RESEND_API_KEY);


async function sendEmail(to: string, subject: string, html: string) { 
resend.emails.send({
  from: 'pulkitpareek88@gmail.com',
    to,
    subject,
    html
  });
}

export { sendEmail };
