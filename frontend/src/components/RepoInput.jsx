import { useState } from 'react';

export default function RepoInput({ onAnalyze, loading }) {
  const [value, setValue] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    onAnalyze(trimmed);
  }

  return (
    <form className="repo-input" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="owner/repo (e.g. ritk7/AI-Knowledge-Document-Management-Platform)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={loading}
        aria-label="GitHub repository"
      />
      <button type="submit" disabled={loading || !value.trim()}>
        {loading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Analyzing…
          </>
        ) : (
          'Analyze repo'
        )}
      </button>
    </form>
  );
}
