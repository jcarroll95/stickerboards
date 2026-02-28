import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import apiClient from '../../services/apiClient.jsx';
import { parseError } from '../../utils/errorUtils.js';
import styles from './AddLogEntryForm.module.css';

export default function AddLogEntryForm({ boardId, type, onCreated, onCancel }) {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Basic validation
    if (!value || value.trim() === '') {
      return toast.error(`Please enter a ${type === 'weight' ? 'weight' : 'message'}`);
    }

    setSubmitting(true);
    const toastId = toast.loading(`Saving ${type}...`);

    try {
      const payload = {
        type,
        [type === 'weight' ? 'weight' : 'content']: type === 'weight' ? Number(value) : value,
        userDate: new Date()
      };

      // Note: We use the boardId from the parent BoardView
      const res = await apiClient.post(`/stickerboards/${boardId}/logs`, payload);

      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} logged!`, { id: toastId });

      // Pass the resulting data back to BoardView to refresh the UI
      onCreated(res);
    } catch (err) {
      console.error('Failed to save log entry:', err);
      toast.error(parseError(err), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label className={styles.label}>
          {type === 'weight' ? 'Current Weight (lbs/kg)' : 'Notes / Victory Details'}
        </label>

        {type === 'weight' ? (
          <input
            type="number"
            step="0.1"
            className={styles.input}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="e.g. 185.5"
            autoFocus
          />
        ) : (
          <textarea
            className={styles.textarea}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={type === 'nsv' ? "Describe your victory..." : "Write a note..."}
            autoFocus
          />
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.buttonCancel}
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.buttonSave}
          disabled={submitting}
        >
          {submitting ? 'Saving...' : 'Save Entry'}
        </button>
      </div>
    </form>
  );
}
