import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { toast } from 'react-hot-toast';
import LoginDropdown from './LoginDropdown.jsx';
import { server } from '../../test/setup.js';
import { http, HttpResponse } from 'msw';

vi.mock('react-hot-toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('LoginDropdown', () => {
  const defaultProps = {
    email: '',
    setEmail: vi.fn(),
    password: '',
    setPassword: vi.fn(),
    loggingIn: false,
    loginError: null,
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the forgot password link', () => {
    render(<LoginDropdown {...defaultProps} />);
    expect(screen.getByRole('button', { name: /forgot password\?/i })).toBeInTheDocument();
  });

  it('should show error if email is missing when clicking forgot password', async () => {
    render(<LoginDropdown {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /forgot password\?/i }));

    expect(toast.error).toHaveBeenCalledWith('Please enter your email address first');
  });

  it('should show error if email is invalid when clicking forgot password', async () => {
    render(<LoginDropdown {...defaultProps} email="invalid-email" />);

    fireEvent.click(screen.getByRole('button', { name: /forgot password\?/i }));

    expect(toast.error).toHaveBeenCalledWith('Please enter a valid email address');
  });

  it('should call forgot password API and show success message', async () => {
    server.use(
      http.post('*/auth/forgotpassword', async ({ request }) => {
        const body = await request.json();
        if (body.email === 'test@example.com') {
          return HttpResponse.json({ success: true });
        }
        return new HttpResponse(null, { status: 400 });
      })
    );

    render(<LoginDropdown {...defaultProps} email="test@example.com" />);

    fireEvent.click(screen.getByRole('button', { name: /forgot password\?/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Password reset email sent!');
    });
  });

  it('should show error message if forgot password API fails', async () => {
    server.use(
      http.post('*/auth/forgotpassword', () => {
        return HttpResponse.json({ success: false, error: 'User not found' }, { status: 404 });
      })
    );

    render(<LoginDropdown {...defaultProps} email="test@example.com" />);

    fireEvent.click(screen.getByRole('button', { name: /forgot password\?/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('User not found');
    });
  });
});
