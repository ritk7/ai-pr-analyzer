export default function Pagination({ page, totalPages, total, onPageChange, disabled }) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Pagination">
      <button onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1}>
        ← Previous
      </button>
      <span className="pagination-status">
        Page {page} of {totalPages} · {total} result{total === 1 ? '' : 's'}
      </span>
      <button onClick={() => onPageChange(page + 1)} disabled={disabled || page >= totalPages}>
        Next →
      </button>
    </nav>
  );
}
