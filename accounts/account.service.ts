import config from '../config.json';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Op } from 'sequelize';
import sendEmail from '../_helpers/send-email';
import db from '../_helpers/db';
import Role from '../_helpers/role';

export default {
  authenticate, refreshToken, revokeToken,
  register, verifyEmail, forgotPassword,
  validateResetToken, resetPassword,
  getAll, getById, create, update, delete: _delete
};

async function authenticate({ email, password, ipAddress }: any) {
  const account = await db.Account.scope('withHash').findOne({ where: { email } });
  if (!account || !account.isVerified || !(await bcrypt.compare(password, account.passwordHash))) {
    throw 'Email or password is incorrect';
  }
  const jwtToken = generateJwtToken(account);
  const refreshToken = generateRefreshToken(account, ipAddress);
  await refreshToken.save();
  return { ...basicDetails(account), jwtToken, refreshToken: refreshToken.token };
}

async function refreshToken({ token, ipAddress }: any) {
  const refreshToken = await getRefreshToken(token);
  const account = await refreshToken.getAccount();
  const newRefreshToken = generateRefreshToken(account, ipAddress);
  refreshToken.revoked = Date.now();
  refreshToken.revokedByIp = ipAddress;
  refreshToken.replacedByToken = newRefreshToken.token;
  await refreshToken.save();
  await newRefreshToken.save();
  const jwtToken = generateJwtToken(account);
  return { ...basicDetails(account), jwtToken, refreshToken: newRefreshToken.token };
}

async function revokeToken({ token, ipAddress }: any) {
  const refreshToken = await getRefreshToken(token);
  refreshToken.revoked = Date.now();
  refreshToken.revokedByIp = ipAddress;
  await refreshToken.save();
}

async function register(params: any, origin: any) {
  if (await db.Account.findOne({ where: { email: params.email } })) {
    return await sendAlreadyRegisteredEmail(params.email, origin);
  }
  const account = new db.Account(params);
  const isFirstAccount = (await db.Account.count()) === 0;
  account.role = isFirstAccount ? Role.Admin : Role.User;
  account.verificationToken = randomTokenString();
  account.passwordHash = await hash(params.password);
  await account.save();
  await sendVerificationEmail(account, origin);
}

async function verifyEmail({ token }: any) {
  const account = await db.Account.findOne({ where: { verificationToken: token } });
  if (!account) throw 'Verification failed';
  account.verified = Date.now();
  account.verificationToken = null;
  await account.save();
}

async function forgotPassword({ email }: any, origin: any) {
  const account = await db.Account.findOne({ where: { email } });
  if (!account) return;
  account.resetToken = randomTokenString();
  account.resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await account.save();
  await sendPasswordResetEmail(account, origin);
}

async function validateResetToken({ token }: any) {
  const account = await db.Account.findOne({
    where: { resetToken: token, resetTokenExpires: { [Op.gt]: Date.now() } }
  });
  if (!account) throw 'Invalid token';
  return account;
}

async function resetPassword({ token, password }: any) {
  const account = await validateResetToken({ token });
  account.passwordHash = await hash(password);
  account.passwordReset = Date.now();
  account.resetToken = null;
  await account.save();
}

async function getAll() {
  const accounts = await db.Account.findAll();
  return accounts.map((x: any) => basicDetails(x));
}

async function getById(id: any) {
  const account = await getAccount(id);
  return basicDetails(account);
}

async function create(params: any) {
  if (await db.Account.findOne({ where: { email: params.email } })) {
    throw 'Email "' + params.email + '" is already registered';
  }
  const account = new db.Account(params);
  account.verified = Date.now();
  account.passwordHash = await hash(params.password);
  await account.save();
  return basicDetails(account);
}

async function update(id: any, params: any) {
  const account = await getAccount(id);
  if (params.email && params.email !== account.email && await db.Account.findOne({ where: { email: params.email } })) {
    throw 'Email "' + params.email + '" is already taken';
  }
  if (params.password) {
    params.passwordHash = await hash(params.password);
  }
  Object.assign(account, params);
  account.updated = Date.now();
  await account.save();
  return basicDetails(account);
}

async function _delete(id: any) {
  const account = await getAccount(id);
  await account.destroy();
}

// Helper functions
async function getAccount(id: any) {
  const account = await db.Account.findByPk(id);
  if (!account) throw 'Account not found';
  return account;
}

async function getRefreshToken(token: any) {
  const refreshToken = await db.RefreshToken.findOne({ where: { token } });
  if (!refreshToken || !refreshToken.isActive) throw 'Invalid token';
  return refreshToken;
}

async function hash(password: any) {
  return await bcrypt.hash(password, 10);
}

function generateJwtToken(account: any) {
  return jwt.sign({ sub: account.id, id: account.id }, config.secret, { expiresIn: '15m' });
}

function generateRefreshToken(account: any, ipAddress: any) {
  return new db.RefreshToken({
    accountId: account.id,
    token: randomTokenString(),
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdByIp: ipAddress
  });
}

function randomTokenString() {
  return crypto.randomBytes(40).toString('hex');
}

function basicDetails(account: any) {
  const { id, title, firstName, lastName, email, role, created, updated, isVerified } = account;
  return { id, title, firstName, lastName, email, role, created, updated, isVerified };
}

async function sendVerificationEmail(account: any, origin: any) {
  let message;
  if (origin) {
    const verifyUrl = `${origin}/account/verify-email?token=${account.verificationToken}`;
    message = `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background-color: #3b5bdb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">Verify My Email</a>
      </div>
      <p style="color: #94a3b8; font-size: 13px;">Or copy this link: <a href="${verifyUrl}" style="color: #3b5bdb;">${verifyUrl}</a></p>
    `;
  } else {
    message = `<p>Please use the token to verify your email address with the <code>/accounts/verify-email</code> api route:</p><p><code>${account.verificationToken}</code></p>`;
  }
  await sendEmail({
    to: account.email,
    subject: 'Sign-up Verification – Verify Email',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 10px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px;">Verify Email</h1>
          <hr style="border: none; border-top: 2px solid #3b5bdb; margin-bottom: 20px;">
          <p style="color: #475569; font-size: 16px;">Thanks for registering!</p>
          <p style="color: #475569; font-size: 16px;">Please click the button below to verify your email address:</p>
          ${message}
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">If you did not register, please ignore this email.</p>
        </div>
      </div>
    `
  });
}

async function sendAlreadyRegisteredEmail(email: any, origin: any) {
  let message;
  if (origin) {
    message = `<p style="color: #475569;">If you don't know your password please visit the <a href="${origin}/account/forgot-password" style="color: #3b5bdb;">forgot password</a> page.</p>`;
  } else {
    message = `<p style="color: #475569;">If you don't know your password you can reset it via the <code>/accounts/forgot-password</code> api route.</p>`;
  }
  await sendEmail({
    to: email,
    subject: 'Sign-up Verification – Email Already Registered',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 10px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px;">Email Already Registered</h1>
          <hr style="border: none; border-top: 2px solid #3b5bdb; margin-bottom: 20px;">
          <p style="color: #475569; font-size: 16px;">Your email <strong>${email}</strong> is already registered.</p>
          ${message}
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">If you did not request this, please ignore this email.</p>
        </div>
      </div>
    `
  });
}

async function sendPasswordResetEmail(account: any, origin: any) {
  let message;
  if (origin) {
    const resetUrl = `${origin}/account/reset-password?token=${account.resetToken}`;
    message = `
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background-color: #3b5bdb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">Reset Password</a>
      </div>
      <p style="color: #94a3b8; font-size: 13px;">Or copy this link: <a href="${resetUrl}" style="color: #3b5bdb;">${resetUrl}</a></p>
    `;
  } else {
    message = `<p>Please use the below token to reset your password with the <code>/accounts/reset-password</code> api route:</p><p><code>${account.resetToken}</code></p>`;
  }
  await sendEmail({
    to: account.email,
    subject: 'Sign-up Verification – Reset Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; border-radius: 10px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h1 style="color: #1e293b; font-size: 28px; margin-bottom: 10px;">Reset Password</h1>
          <hr style="border: none; border-top: 2px solid #3b5bdb; margin-bottom: 20px;">
          <p style="color: #475569; font-size: 16px;">Please click the button below to reset your password. The link is valid for 1 day.</p>
          ${message}
          <p style="color: #94a3b8; font-size: 12px; margin-top: 20px;">If you did not request this, please ignore this email.</p>
        </div>
      </div>
    `
  });
}