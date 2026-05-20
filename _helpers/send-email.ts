import nodemailer from 'nodemailer';
import config from '../config.json';
export default async function sendEmail({ to, subject, html, from = config.emailFrom }: any) {
  const transporter = nodemailer.createTransport({
    ...config.smtpOptions,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
  });
  try {
    await transporter.sendMail({ from, to, subject, html });
  } catch (err) {
    console.error('Email sending failed:', err);
    // Don't throw - allow registration to succeed even if email fails
  }
}