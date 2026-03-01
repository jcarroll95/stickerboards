import React, { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import PropTypes from 'prop-types';
import useAuthStore from '../store/authStore.js';
import useCommunityStore from '../store/communityStore.js';
import LoadingSpinner from './common/LoadingSpinner.jsx';
import styles from './Router.module.css';

// Lazy load major route components
const StickerboardsDemo = lazy(() => import('../StickerboardsDemo.jsx'));
const BoardView = lazy(() => import('./board/BoardView.jsx'));
const Explore = lazy(() => import('./explore/Explore.jsx'));
const RegisterVerify = lazy(() => import('./auth/RegisterVerify.jsx'));
const CreateStickerboard = lazy(() => import('./board/CreateStickerboard.jsx'));
const MetricsDashboard = lazy(() => import('./admin/MetricsDashboard.jsx'));
const UserManager = lazy(() => import('./admin/UserManager.jsx'));
const StickerPicker = lazy(() => import('./admin/StickerPicker.jsx'));
const AssetIngestion = lazy(() => import('./admin/AssetIngestion.jsx'));
const UserSettings = lazy(() => import('./user/UserSettings.jsx'));
const LandingPage = lazy(() => import('./LandingPage.jsx'));

export default function Router() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  const { isAuthenticated, user } = useAuthStore();
  const { fetchStats } = useCommunityStore();

  useEffect(() => {
    const onHashChange = () => {
      setHash(window.location.hash || '#/');
      if (isAuthenticated) {
        fetchStats();
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [isAuthenticated, fetchStats]);

  const route = useMemo(() => {
    const h = hash.startsWith('#') ? hash : `#/${hash}`;
    const path = h.slice(1);
    const [pathOnly, queryString] = path.split('?');
    const parts = pathOnly.split('/').filter(Boolean);
    const searchParams = new URLSearchParams(queryString || '');
    return { parts, searchParams };
  }, [hash]);

  const [first, second] = route.parts;

  useEffect(() => {
    const isBoardCreate = first === 'board' && second === 'create';
    const isBoardToken = first === 'board' && second && second !== 'create';

    if ((isBoardCreate || isBoardToken) && !isAuthenticated) {
      if (window.location.hash !== '#/') {
        window.location.hash = '#/';
      }
    }
  }, [first, second, isAuthenticated]);

  const renderContent = () => {
    if (route.parts.length === 0) return <LandingPage />;

    switch (first) {
      case 'register':
        if (second === 'verify') {
          return <RegisterVerify mode="verify" initialEmail={route.searchParams.get('email') || ''} />;
        }
        return <RegisterVerify />;

      case 'board':
        if (!second) return <StickerboardsDemo />;
        if (!isAuthenticated) return <LandingPage />;
        if (second === 'create') return <CreateStickerboard />;
        return <BoardView token={second} />;

      case 'explore':
        return <Explore />;

      case 'settings':
        return isAuthenticated ? <UserSettings /> : <LandingPage />;

      case 'admin':
        if (!isAuthenticated || user?.role !== 'admin') return <LandingPage />;
        if (second === 'metrics') return <MetricsDashboard />;
        if (second === 'users') return <UserManager />;
        if (second === 'stickers') return <StickerPicker />;
        if (second === 'assets') return <AssetIngestion />;
        return <NotFound hash={hash} />;

      default:
        return <NotFound hash={hash} />;
    }
  };

  return (
    <div className={styles.routerContainer}>
      <Suspense fallback={<LoadingSpinner message="Loading page..." />}>
        {renderContent()}
      </Suspense>
    </div>
  );
}


/**
 * NotFound Component
 */
function NotFound({ hash }) {
  return (
    <div className={styles.notFoundContainer}>
      <h2>Not Found</h2>
      <p>No route matches <code className={styles.notFoundCode}>{hash}</code>.</p>
    </div>
  );
}

NotFound.propTypes = {
  hash: PropTypes.string.isRequired,
};
