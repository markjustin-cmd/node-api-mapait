import config from '../config.json';

export default async function sendEmail({ to, subject, html, from = config.emailFrom }: any) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: [to],
        subject: subject,
        html: html
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Resend API error:', errText);
    } else {
      console.log('Email sent successfully to:', to);
    }
  } catch (err) {
    console.error('Email sending failed:', err);
  }
}