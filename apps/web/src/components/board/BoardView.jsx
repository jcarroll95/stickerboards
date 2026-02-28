import React, { useMemo, useState, useEffect, useRef, Suspense, lazy } from 'react';
import PropTypes from 'prop-types';
import { toast } from 'react-hot-toast';
import DOMPurify from 'dompurify';
// import StickerInterface from '../stickerInterface/StickerInterface.jsx'
import AddStickForm from '../stix/AddStickForm.jsx';
import CommentList from '../comments/CommentList.jsx';
import AddCommentForm from '../comments/AddCommentForm.jsx';
import LoadingSpinner from '../common/LoadingSpinner.jsx';
import { useBoardData, useMe } from '../../hooks/useBoardData.js';
import { useStickerInventory } from '../../hooks/useStickerInventory.js';
import apiClient from '../../services/apiClient.jsx';
import { parseError } from '../../utils/errorUtils.js';
import { uploadThumbnail } from '../../utils/thumbnailUploader.js';
import { generateOpId, storePendingOperation, completeOperation, failOperation } from '../../utils/operationIdGenerator.js';
import StixList from './subcomponents/StixList.jsx';
import styles from './BoardView.module.css';
import formStyles from '../stix/AddStickForm.module.css';
import AddLogEntryForm from '../logs/AddLogEntryForm.jsx';
const StickerInterface = lazy(() => import('../stickerInterface/StickerInterface.jsx'));

export default function BoardView({ token }) {
  const { board, loading, error, refreshBoard } = useBoardData(token);
  const { me, refreshMe } = useMe();
  const { fetchUserStickerInventory } = useStickerInventory();
  const [showAddModal, setShowAddModal] = useState(false);
  const [logModal, setLogModal] = useState({ show: false, type: null });
  const [commentsVersion, setCommentsVersion] = useState(0);
  const [isAssetsReady, setIsAssetsReady] = useState(false);
  const stageRef = useRef(null);

  const isOwner = me && board && (board.user?._id || board.user) === (me._id || me.id);

  const [activeTab, setActiveTab] = useState(isOwner ? 'stix' : 'comments');

  useEffect(() => {
    // 1. Only proceed if we have a board, the user is the owner, and assets are ready
    const boardId = board?._id || board?.id;
    if (!board || !isOwner || !isAssetsReady || !stageRef.current) return;

    // 2. Get the latest sticker creation date (default to 0 if no stickers)
    const latestStickerTime = board.stickers?.length > 0
      ? Math.max(...board.stickers.map(s => new Date(s.createdAt).getTime()))
      : 0;

    // 3. Get the current thumbnail version (as a timestamp)
    const thumbTime = board.thumbnail.createdAt
      ? new Date(board.thumbnail.version).getTime()
      : 0;

    // 4. If a sticker is newer than the thumbnail, trigger an update
    if (latestStickerTime > thumbTime) {
      console.log('Stale thumbnail detected, updating...');

      // Use a small delay to ensure all sticker images are fully rendered in the Konva stage
      setTimeout(() => {
        uploadThumbnail(boardId, stageRef).catch(err => {
          console.warn('Auto-thumbnail update failed:', err);
        });
      }, 1500); // 1.5s is usually safe for asset loading
    }
  }, [board, isOwner, isAssetsReady]);


  // Ensure activeTab is set correctly when board/me seed-data loads
  useEffect(() => {
    if (board && me) {
      setActiveTab(isOwner ? 'stix' : 'comments');
    }
  }, [isOwner, board, me]);

  // Auto-generate thumbnail if it doesn't exist (e.g. newly created board)
  useEffect(() => {
    // Only proceed if board data is loaded, user is owner, assets are loaded, and thumbnail is missing
    const boardId = board?._id || board?.id;
    if (board && isOwner && isAssetsReady && !board.thumbnail?.url && stageRef.current) {
      console.log('No thumbnail found for board, triggering auto-generation...');
      uploadThumbnail(boardId, stageRef).catch(err => {
        // Silently fail as this is a background task
        console.warn('Auto-thumbnail generation failed:', err);
      });
    }
  }, [board, isOwner, isAssetsReady]);

  // Check for stale thumbnail and regenerate if needed
  useEffect(() => {
    const boardId = board?._id || board?.id;
    if (!board || !isOwner || !isAssetsReady || !stageRef.current) return;

    // 1. Get latest sticker creation time
    const latestStickerTime = board.stickers?.length > 0
      ? Math.max(...board.stickers.map(s => new Date(s.createdAt).getTime()))
      : 0;

    // 2. Get current thumbnail creation time
    const thumbTime = board.thumbnail?.createdAt
      ? new Date(board.thumbnail.createdAt).getTime()
      : 0;

    // 3. If a sticker is newer than the thumbnail, trigger an update
    if (latestStickerTime > thumbTime) {
      console.log('Stale thumbnail detected, triggering auto-regeneration...');
      // Small delay to ensure all assets are definitely rendered
      setTimeout(() => {
        uploadThumbnail(boardId, stageRef).catch(err => {
          console.warn('Stale thumbnail auto-regeneration failed:', err);
        });
      }, 1500);
    }
  }, [board, isOwner, isAssetsReady]);

  useEffect(() => {
    const handler = async (e) => {
      if (e?.detail?.boardId === (board?._id || board?.id)) {
        await refreshBoard();
        refreshMe();
        if (me?._id || me?.id) {
          fetchUserStickerInventory(me?._id || me?.id);
        }

        // After board refresh, wait for next render cycle and generate thumbnail
        // This ensures the new sticker is rendered in the Konva stage
        // We use a small delay to ensure high-res inventory images are loaded
        setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (stageRef.current) {
                console.log('Generating post-finalize thumbnail for board:', board?._id || board?.id);
                uploadThumbnail(board?._id || board?.id, stageRef).catch(err =>
                  console.warn('Post-finalize thumbnail upload failed:', err)
                );
              } else {
                console.warn('Post-finalize thumbnail failed: stageRef.current is null');
              }
            });
          });
        }, 1000); // Increased delay to ensure all assets are definitely ready
      }
    };
    window.addEventListener('stickerboard:finalized', handler);
    window.addEventListener('stickerboard:cleared', handler);
    return () => {
      window.removeEventListener('stickerboard:finalized', handler);
      window.removeEventListener('stickerboard:cleared', handler);
    };
  }, [board?._id, board?.id, refreshBoard, refreshMe]);

  const nextStickNumber = useMemo(() => {
    if (!board?.stix?.length) return 1;
    return Math.max(...board.stix.map(s => s.stickNumber || 0)) + 1;
  }, [board?.stix]);

  if (loading) return <LoadingSpinner message="Loading board…" />;
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!board) return <div className={styles.error}>Board not found</div>;

  const isAdmin = me?.role === 'admin';

  const handleRegenerateThumbnail = async () => {
    const toastId = toast.loading('Generating thumbnail...');
    try {
      await uploadThumbnail(board._id || board.id, stageRef, true);
      toast.success('Thumbnail regenerated!', { id: toastId });
      refreshBoard();
    } catch (err) {
      toast.error(parseError(err), { id: toastId });
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.headerRow}>
        <h1 className={styles.title} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(board.name || 'Stickerboard') }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          {isOwner && (
            <div className={styles.buttonGroup}>
              <button className={styles.addButton} onClick={() => setShowAddModal(true)}>
                + Add Stick
              </button>
              <button className={styles.addButton} onClick={() => setLogModal({ show: true, type: 'weight' })}>
                Log Weight
              </button>
              <button className={styles.addButton} onClick={() => setLogModal({ show: true, type: 'nsv' })}>
                Log Victory
              </button>
              <button className={styles.addButton} onClick={() => setLogModal({ show: true, type: 'note' })}>
                Add Note
              </button>
            </div>
          )}
          {isAdmin && (
            <button className={styles.addButton} onClick={handleRegenerateThumbnail}>
              🔄 Regenerate Thumbnail
            </button>
          )}
        </div>
      </header>

      {board.description && (
        <p className={styles.description} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(board.description) }} />
      )}

      {Array.isArray(board.tags) && board.tags.length > 0 && (
        <div className={styles.tags}>
          {board.tags.map((tag, i) => (
            <span key={`${tag}-${i}`} className={styles.tag}>{String(tag)}</span>
          ))}
        </div>
      )}

      {(() => {
        const assetsBaseUrl = import.meta.env.VITE_ASSETS_BASE_URL || '/assets';
        const p = String(board?.photo || '').trim();
        const isHttp = /^https?:\/\//i.test(p);
        const isSbPng = /^sb[0-9]+\.png$/i.test(p);
        const boardSrc = isHttp ? p : (isSbPng ? `${assetsBaseUrl}/${p}` : `${assetsBaseUrl}/sb0.png`);
        const sharedProps = {
          board,
          boardId: board._id || board.id,
          boardSrc,
          stickers: board.stickers || [],
          persistedStickers: board.stickers || [],
          isOwner,
          cheersStickers: me?.cheersStickers || [],
        };

        const onPlace = async (next, placed, index) => {
          const toastId = toast.loading('Saving...');

          // Generate operation ID for idempotency
          const opId = generateOpId();

          try {
            // Store as pending operation
            storePendingOperation(opId, {
              type: 'updateStickerboard',
              boardId: board._id || board.id,
              payload: { stickers: next }
            });

            const response = await apiClient.put(`/stickerboards/${board._id || board.id}`, {
              stickers: next,
              opId // Include operation ID for idempotency
            });

            // Check if operation was already completed (cached response)
            if (response.data.cached) {
              console.log('[BoardView] Operation already completed:', opId);
            }

            // Mark operation as complete
            completeOperation(opId);

            // Thumbnail generation now happens after board refresh (see useEffect above)
            // This ensures the new sticker is rendered before capturing

            window.dispatchEvent(new CustomEvent('stickerboard:finalized', { detail: { boardId: board._id || board.id, sticker: placed, index, opId } }));
            toast.success('Saved!', { id: toastId });
          } catch (err) {
            // Handle specific error cases
            if (err.response?.status === 409) {
              // Operation already in progress or completed
              console.warn('[BoardView] Operation conflict (409):', opId);
              completeOperation(opId); // Remove from pending since server has it
              toast.success('Saved!', { id: toastId }); // Still show success to user
            } else {
              // Mark as failed for potential retry
              failOperation(opId, err.message);
              toast.error(parseError(err), { id: toastId });
            }
          }
        };

        return (
          <Suspense fallback={<LoadingSpinner message="Loading canvas..." />}>
            <StickerInterface
              {...sharedProps}
              forwardStageRef={stageRef}
              onReady={() => setIsAssetsReady(true)}
              onPlaceSticker={onPlace}
              onClearStickers={isOwner ? async (next) => {
                const toastId = toast.loading('Clearing...');
                const opId = generateOpId();
                try {
                  storePendingOperation(opId, {
                    type: 'clearStickers',
                    boardId: board._id || board.id,
                    payload: { stickers: next }
                  });

                  const response = await apiClient.put(`/stickerboards/${board._id || board.id}`, {
                    stickers: next,
                    opId
                  });

                  if (response.data.cached) {
                    console.log('[BoardView] Clear operation already completed:', opId);
                  }

                  completeOperation(opId);
                  window.dispatchEvent(new CustomEvent('stickerboard:cleared', { detail: { boardId: board._id || board.id, opId } }));
                  toast.success('Cleared!', { id: toastId });
                } catch (err) {
                  if (err.response?.status === 409) {
                    completeOperation(opId);
                    toast.success('Cleared!', { id: toastId });
                  } else {
                    failOperation(opId, err.message);
                    toast.error(parseError(err), { id: toastId });
                  }
                }
              } : undefined}
            />
          </Suspense>
        );
      })()}

      {isOwner && (
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'stix' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('stix')}
          >
            My Stix
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'comments' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('comments')}
          >
            Comments
          </button>
        </div>
      )}

      {activeTab === 'stix' && isOwner && (
        <section className={styles.tabContent}>
          <h2>Stix</h2>
          <StixList stix={board.stix} />
        </section>
      )}

      {activeTab === 'comments' && (
        <section className={styles.tabContent} style={{ marginTop: isOwner ? 0 : 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2>Comments</h2>
            <AddCommentForm boardId={board._id || board.id} onSubmitted={() => setCommentsVersion(v => v + 1)} />
          </div>
          <CommentList key={commentsVersion} boardId={board._id || board.id} />
        </section>
      )}

      {isOwner && showAddModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalDialog}>
            <div className={styles.modalHeader}>
              <h3>Add a new Stick</h3>
              <button className={styles.modalClose} onClick={() => setShowAddModal(false)}>&times;</button>
            </div>
            <div className={styles.modalBody}>
              <AddStickForm
                boardId={board._id || board.id}
                nextStickNumber={nextStickNumber}
                title={null}
                className={formStyles.modalForm}
                onCreated={() => { setShowAddModal(false); refreshBoard(); }}
                onCancel={() => setShowAddModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {logModal.show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalDialog}> {/* Use your existing modal styles */}
            <div className={styles.modalHeader}>
              <h3>Log {logModal.type === 'nsv' ? 'Non-Scale Victory' : logModal.type.charAt(0).toUpperCase() + logModal.type.slice(1)}</h3>
              <button className={styles.modalClose} onClick={() => setLogModal({ show: false, type: null })}>&times;</button>
            </div>
            <div className={styles.modalBody}>
              <AddLogEntryForm
                boardId={board._id || board.id}
                type={logModal.type}
                onCancel={() => setLogModal({ show: false, type: null })}
                onCreated={() => {
                  setLogModal({ show: false, type: null });
                  refreshBoard();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



BoardView.propTypes = {
  token: PropTypes.string.isRequired,
};
