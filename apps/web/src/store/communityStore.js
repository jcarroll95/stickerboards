import { create } from 'zustand';
import apiClient from '../services/apiClient.jsx';

/**
 * Community Store
 *
 * Manages global community statistics (momentum, weight loss).
 * Includes a 60-second rate limit for fetching to prevent over-polling.
 */
const useCommunityStore = create((set, get) => ({
  stats: {
    totalCommunityMomentum: 0,
    totalWeightLost: 0,
    lastUpdated: null
  },
  lastFetchedAt: 0,
  isLoading: false,
  error: null,

  /**
   * Fetch community stats from the backend.
   * Rate limited to once every 10 seconds.
   */
  fetchStats: async (force = false) => {
    const now = Date.now();
    const { lastFetchedAt, isLoading } = get();

    // Skip if already loading or if within 10s of last fetch (unless forced)
    if (isLoading || (!force && now - lastFetchedAt < 10000)) {
      return;
    }

    set({ isLoading: true, error: null });

    try {
      const response = await apiClient.get('/community/stats');
      const payload = (response && response.data && response.data.data)
        ? response.data.data
        : (response && response.data)
          ? response.data
          : response;

      // Update dynamic brand hue based on momentum (0-359)
      const hue = Math.floor((payload.totalCommunityMomentum || 0) % 360);
      try {
        document.documentElement.style.setProperty('--brand-hue', `${hue}deg`);
      } catch (_) {
        // no-op if document is unavailable (SSR/tests)
      }

      set({
        stats: payload,
        lastFetchedAt: now,
        error: null
      });
    } catch (err) {
      console.error('[CommunityStore] Failed to fetch stats:', err);
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  }
}));

export default useCommunityStore;
