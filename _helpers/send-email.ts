import nodemailer from 'nodemailer';
import config from '../config.json';

export default async function sendEmail({ to, subject, html, from = config.emailFrom }: any) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
  try {
    await transporter.sendMail({ from, to, subject, html });
    console.log('Email sent successfully to:', to);
  } catch (err) {
    console.error('Email sending failed:', err);
  }
}