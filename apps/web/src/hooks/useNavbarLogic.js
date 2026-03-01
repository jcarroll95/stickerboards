import { useState, useCallback } from 'react';
import apiClient from '../services/apiClient.jsx';
import useAuthStore from '../store/authStore.js';
import useCommunityStore from '../store/communityStore.js';

export function useNavbarLogic() {
  const { user, login } = useAuthStore();
  const { fetchStats } = useCommunityStore();
  const [navigatingMyBoard, setNavigatingMyBoard] = useState(false);
  const [navigatingCheer, setNavigatingCheer] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  const goToMyBoard = useCallback(async () => {
    if (navigatingMyBoard) return;
    setNavigatingMyBoard(true);
    try {
      const response = await apiClient.get('/auth/me');
      const currentUser = response.data || response;
      const uid = currentUser._id || currentUser.id;

      if (!uid) {
        setLoginOpen(true);
        return;
      }

      const sbResponse = await apiClient.get(`/stickerboards?user=${encodeURIComponent(uid)}&limit=1`);
      const boards = sbResponse?.data || (Array.isArray(sbResponse) ? sbResponse : []);
      const board = boards[0];

      if (!board) {
        window.location.hash = '#/board/create';
        return;
      }

      window.location.hash = `#/board/${board._id || board.id || board.slug}`;
    } catch (err) {
      if (err.response?.status === 401) {
        setLoginOpen(true);
      }
      console.error('[Navbar] Error navigating to board:', err);
    } finally {
      setNavigatingMyBoard(false);
    }
  }, [navigatingMyBoard]);

  const cheer = useCallback(async () => {
    if (navigatingCheer) return;
    if (!user) {
      setLoginOpen(true);
      return;
    }
    setNavigatingCheer(true);
    try {
      const uid = user._id || user.id;
      const response = await apiClient.get(`/stickerboards?user[ne]=${uid}&limit=50`);
      const data = response?.data || response;
      const boards = Array.isArray(data) ? data : (data?.data || []);

      if (boards.length === 0) {
        window.location.hash = '#/explore';
        return;
      }

      const randomBoard = boards[Math.floor(Math.random() * boards.length)];
      window.location.hash = `#/board/${randomBoard._id || randomBoard.id || randomBoard.slug}`;
    } catch (err) {
      console.error('[Navbar] Cheer! failed:', err);
      window.location.hash = '#/explore';
    } finally {
      setNavigatingCheer(false);
    }
  }, [navigatingCheer, user]);

  const performLogin = useCallback(async (email, password) => {
    if (loggingIn) return;
    setLoginError('');
    setLoggingIn(true);
    try {
      await apiClient.post('/auth/login', { email, password });
      const response = await apiClient.get('/auth/me');
      login(response.data || response);
      setLoginOpen(false);
      fetchStats();
      return true;
    } catch (err) {
      setLoginError(err.response?.data?.error || err.message || 'Login failed');
      return false;
    } finally {
      setLoggingIn(false);
    }
  }, [loggingIn, login]);

  return {
    navigatingMyBoard,
    navigatingCheer,
    loginOpen,
    setLoginOpen,
    loggingIn,
    loginError,
    goToMyBoard,
    cheer,
    performLogin
  };
}
