const asyncHandler = require('../middleware/async');
const ErrorResponse = require('../utils/errorResponse');

const {
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
  refreshTokens,
  renderResetPasswordForm
} = require('../usecases/auth/authUsecases');

/**
 * HTTP helper: set refresh cookie and send access token response.
 *
 */
const sendTokenResponse = (user, tokens, statusCode, res) => {
  res
    .status(statusCode)
    .cookie('refreshToken', tokens.refreshToken, {
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production'
      })
    // split from one auth token to refresh + access but didn't refactor how the front end handles it
    // so we'll just send two cookies back
    .cookie('token', tokens.accessToken, {
      expires: new Date(Date.now() + 15 * 60  * 1000),
      httpOnly: true
    })
    .json({
      success: true,
      token: tokens.accessToken,
      data: user,
    });
};

/**
 * @desc    Register User
 * @route   POST /api/v1/auth/register
 * @access  Public
 */
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const { token, user } = await register({
    name,
    email,
    password,
    role,
    nodeEnv: process.env.NODE_ENV,
  });

  // keep old behavior: token in response (no cookie for register)
  res.status(200).json({ success: true, token, data: user });
});

/**
 * @desc    Login User
 * @route   POST /api/v1/auth/login
 * @access  Public
 */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { tokens, user } = await login({ email, password });

  sendTokenResponse(user, tokens, 200, res);
});

/**
 * @desc    Logout current logged in user and clear cookie
 * @route   GET /api/v1/auth/logout
 * @access  Private
 */
exports.logout = asyncHandler(async (req, res) => {
  await logout();

  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });

  res.status(200).json({ success: true, data: {} });
});

/**
 * @desc    Get current logged in user
 * @route   GET /api/v1/auth/me
 * @access  Private
 */
exports.getMe = asyncHandler(async (req, res) => {
  const { user } = await getMe({ userId: req.user.id });
  res.status(200).json({ success: true, data: user });
});

/**
 * @desc    Forgot Password
 * @route   POST /api/v1/auth/forgotpassword
 * @access  Public
 */
exports.forgotPassword = asyncHandler(async (req, res, next) => {
  const email = req.body.email;
  if (!email) return next(new ErrorResponse('Email is required', 400));

  await forgotPassword({
    email,
    protocol: req.protocol,
    host: req.get('host'),
  });

  res.status(200).json({ success: true, data: 'Password reset email sent' });
});

/**
 * @desc    Render Reset Password Form
 * @route   GET /api/v1/auth/resetpassword/:resettoken
 * @access  Public
 */
exports.renderResetPasswordForm = asyncHandler(async (req, res) => {
  const resetToken = req.params.resettoken;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Password</title>
    <style>
        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f4f4f4; }
        .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h1 { margin-bottom: 1.5rem; color: #333; text-align: center; }
        .form-group { margin-bottom: 1rem; }
        label { display: block; margin-bottom: 0.5rem; color: #666; }
        input { width: 100%; padding: 0.75rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 0.75rem; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; }
        button:hover { background-color: #0056b3; }
        #message { margin-top: 1rem; text-align: center; color: #d9534f; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Reset Password</h1>
        <form id="resetForm">
            <div class="form-group">
                <label for="password">New Password</label>
                <input type="password" id="password" required minlength="6">
            </div>
            <div class="form-group">
                <label for="confirmPassword">Confirm Password</label>
                <input type="password" id="confirmPassword" required minlength="6">
            </div>
            <button type="submit">Reset Password</button>
        </form>
        <div id="message"></div>
    </div>

    <script>
        const form = document.getElementById('resetForm');
        const messageDiv = document.getElementById('message');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            if (password !== confirmPassword) {
                messageDiv.textContent = 'Passwords do not match';
                return;
            }

            try {
                const response = await fetch('/api/v1/auth/resetpassword/${resetToken}', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });

                const data = await response.json();

                if (data.success) {
                    messageDiv.style.color = 'green';
                    messageDiv.textContent = 'Password reset successful! You can now log in.';
                    form.style.display = 'none';
                } else {
                    messageDiv.textContent = data.error || 'Something went wrong. Please try again.';
                }
            } catch (err) {
                messageDiv.textContent = 'Network error. Please try again.';
            }
        });
    </script>
</body>
</html>
  `;

  res.send(html);
});

/**
 * @desc    Reset Password
 * @route   PUT /api/v1/auth/resetpassword/:resettoken
 * @access  Private
 */
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, user } = await resetPassword({
    resetTokenParam: req.params.resettoken,
    newPassword: req.body.password,
  });

  const tokens = { accessToken: token, refreshToken: 'mock-refresh' };
  sendTokenResponse(user, tokens, 200, res);
});

/**
 * @desc    Start registration (send verification code)
 * @route   POST /api/v1/auth/register-start
 * @access  Public
 */
exports.registerStart = asyncHandler(async (req, res) => {
  await registerStart({
    email: req.body.email,
    password: req.body.password,
    name: req.body.name,
  });

  res.status(200).json({ success: true });
});

/**
 * @desc    Verify email with code and complete registration
 * @route   POST /api/v1/auth/register-verify
 * @access  Public
 */
exports.registerVerify = asyncHandler(async (req, res) => {
  const { token, user } = await registerVerify({
    email: req.body.email,
    code: req.body.code,
    nodeEnv: process.env.NODE_ENV,
  });

  const tokens = { accessToken: token, refreshToken: 'mock-refresh' };
  sendTokenResponse(user, tokens, 200, res);
});

/**
 * @desc    Resend verification code
 * @route   POST /api/v1/auth/register-resend
 * @access  Public
 */
exports.registerResend = asyncHandler(async (req, res) => {
  await registerResend({ email: req.body.email });
  res.status(200).json({ success: true });
});

/**
 * @desc    Update user details
 * @route   PUT /api/v1/auth/updatedetails
 * @access  Private
 */
exports.updateDetails = asyncHandler(async (req, res) => {
  const { user } = await updateDetails({
    userId: req.user.id,
    email: req.body.email,
    name: req.body.name,
  });

  res.status(200).json({ success: true, data: user });
});

/**
 * @desc    Update Password
 * @route   PUT /api/v1/auth/updatepassword
 * @access  Private
 */
exports.updatePassword = asyncHandler(async (req, res) => {
  const { token, user } = await updatePassword({
    userId: req.user.id,
    currentPassword: req.body.currentPassword,
    newPassword: req.body.newPassword,
  });

  const tokens = { accessToken: token, refreshToken: 'mock-refresh' };
  sendTokenResponse(user, tokens, 200, res);
});

/**
 * @desc    Get new access token using refresh token
 * @route   POST /api/v1/auth/refresh
 * @access  Public
 */
exports.refresh = asyncHandler(async (req, res, next) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    return next(new ErrorResponse('Session expired. Please log in again.', 401));
  }

  // Call use-case to swap refresh token for new tokens
  const { tokens, user } = await refreshTokens({ refreshToken });

  // Use helper to send the new tokens back
  sendTokenResponse(user, tokens, 200, res);
});
