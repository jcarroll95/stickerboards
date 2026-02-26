const crypto = require('crypto');
const ErrorResponse = require('../../utils/errorResponse');
const sendEmail = require('../../utils/sendEmail');
const User = require('../../models/User');
const { assignStarterPackToUser } = require('../../services/stickerInventory');

const { normalizeEmail, assertValidEmailAndPassword } = require('../../domain/auth/validators');

/**
 * Usecases return plain objects (or user docs) and throw ErrorResponse on failure.
 * Controllers handle cookies/HTTP response formatting.
 */

async function register({ name, email, password, role, nodeEnv }) {
  const user = await User.create({
    name,
    email,
    password,
    role: nodeEnv === 'test' ? role : (role || 'user'),
  });

  const token = user.getSignedJwtToken();
  return { token, user };
}

async function login({ email, password }) {
  if (!email || !password) {
    throw new ErrorResponse('Please provide an email and password', 400);
  }

  const user = await User.findOne({ email }).select('+password');
  if (!user) throw new ErrorResponse('Invalid credentials', 401);

  const isMatch = await user.matchPassword(password);
  if (!isMatch) throw new ErrorResponse('Invalid credentials', 401);

  if (!user.isVerified) {
    throw new ErrorResponse('Please verify your email address before logging in.', 403);
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = user.getSignedJwtToken();
  return { token, user };
}

async function logout() {
  return { success: true };
}

async function getMe({ userId }) {
  const user = await User.findById(userId);
  return { user };
}

async function forgotPassword({ email, protocol, host }) {
  const user = await User.findOne({ email });
  if (!user) throw new ErrorResponse('Invalid Credentials', 404);

  const resetToken = user.getResetPasswordToken();
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${protocol}://${host}/api/v1/auth/resetpassword/${resetToken}`;
  const message =
    `You are receiving this email because you (or someone else) have requested the reset of a password.\n\n` +
    `Please click the link below to reset your password. This link will expire in 10 minutes:\n\n${resetUrl}`;

  try {
    await sendEmail({
      email: user.email,
      subject: 'Password Reset Token',
      message,
    });

    return { sent: true };
  } catch (err) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save({ validateBeforeSave: false });

    throw new ErrorResponse('Email could not be sent', 500);
  }
}

async function resetPassword({ resetTokenParam, newPassword }) {
  const resetPasswordToken = crypto.createHash('sha256').update(resetTokenParam).digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) throw new ErrorResponse('Invalid token', 400);

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  const token = user.getSignedJwtToken();
  return { token, user };
}

async function registerStart({ email, password, name }) {
  const normalizedEmail = normalizeEmail(email);
  const pwd = password;
  const displayName = (name || '').toString().trim() || 'New User';

  assertValidEmailAndPassword(normalizedEmail, pwd);

  let user = await User.findOne({ email: normalizedEmail });

  // If user exists and is verified, respond with generic success to avoid enumeration
  if (user && user.isVerified) return { success: true };

  // Create pending user if not extant
  if (!user) {
    user = await User.create({ name: displayName, email: normalizedEmail, password: pwd, isVerified: false });
  } else {
    // User exists but unverified: update password if provided (optional)
    if (pwd) user.password = pwd;
  }

  // Cooldown: avoid spamming email sends (60s)
  const now = Date.now();
  const lastSent = user.lastVerificationSentAt ? user.lastVerificationSentAt.getTime() : 0;
  if (lastSent && now - lastSent < 60 * 1000) {
    return { success: true };
  }

  const code = user.getVerifyEmailToken();
  await user.save({ validateBeforeSave: false });

  const message = `Your verification code is ${code}. It expires in 15 minutes.`;
  await sendEmail({ email: user.email, subject: 'Your verification code', message });

  return { success: true };
}

async function registerVerify({ email, code, nodeEnv }) {
  const normalizedEmail = normalizeEmail(email);
  const c = String(code || '');

  if (!normalizedEmail || !c) throw new ErrorResponse('Email and code are required', 400);

  const user = await User.findOne({ email: normalizedEmail }).select('+password');
  if (!user || user.isVerified) throw new ErrorResponse('Invalid or expired verification code', 400);

  // Lockout after too many attempts
  const attempts = user.verifyEmailAttempts || 0;
  if (attempts >= 5) {
    throw new ErrorResponse('Too many incorrect attempts. Please request a new code later.', 429);
  }

  const hashed = crypto.createHash('sha256').update(c).digest('hex');
  const isTestBypass = nodeEnv === 'test' && c === '123456';

  if (
    !isTestBypass &&
    (user.verifyEmailToken !== hashed || !user.verifyEmailExpire || Date.now() > user.verifyEmailExpire)
  ) {
    user.verifyEmailAttempts = attempts + 1;
    await user.save({ validateBeforeSave: false });
    throw new ErrorResponse('Invalid or expired verification code', 400);
  }

  user.isVerified = true;
  user.verifyEmailToken = undefined;
  user.verifyEmailExpire = undefined;
  user.verifyEmailAttempts = 0;

 /* Legacy sticker seeding
 // Initialize cheersStickers if they don't exist (for existing users during verification)
  if (!user.cheersStickers || user.cheersStickers.length === 0) {
    user.cheersStickers = [0, 1, 2, 3, 4];
  }
*/
  try {
    await assignStarterPackToUser(user.id);
  } catch (err) {
    console.error('Failed to award starter pack:', err);
  }


  await user.save();

  const token = user.getSignedJwtToken();
  return { token, user };
}

async function registerResend({ email }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new ErrorResponse('Email is required', 400);

  const user = await User.findOne({ email: normalizedEmail });

  // Do not enumerate
  if (!user || user.isVerified) return { success: true };

  const now = Date.now();
  const lastSent = user.lastVerificationSentAt ? user.lastVerificationSentAt.getTime() : 0;
  if (lastSent && now - lastSent < 60 * 1000) {
    return { success: true };
  }

  const code = user.getVerifyEmailToken();
  await user.save({ validateBeforeSave: false });

  const message = `Your verification code is ${code}. It expires in 15 minutes.`;
  await sendEmail({ email: user.email, subject: 'Your verification code', message });

  return { success: true };
}

async function updateDetails({ userId, email, name }) {
  const fieldsToUpdate = { email, name };

  const user = await User.findByIdAndUpdate(userId, fieldsToUpdate, {
    new: true,
    runValidators: true,
  });

  return { user };
}

async function updatePassword({ userId, currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new ErrorResponse('User not found', 404);

  if (!(await user.matchPassword(currentPassword))) {
    throw new ErrorResponse('Invalid password', 401);
  }

  user.password = newPassword;
  await user.save();

  const token = user.getSignedJwtToken();
  return { token, user };
}

module.exports = {
  register,
  login,
  logout,
  getMe,
  forgotPassword,
  resetPassword,
  registerStart,
  registerVerify,
  registerResend,
  updateDetails,
  updatePassword,
};
