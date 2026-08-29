import { describeError } from '../errorMessages.js';

export default function ErrorBanner({ error, onDismiss }) {
  if (!error) return null;
  const { title, hint } = describeError(error);

  return (
    <div className="error-banner" role="alert">
      <div className="error-banner-body">
        <strong>{title}</strong>
        <p>{hint}</p>
        {error.message && error.message !== title && <p className="error-banner-detail">{error.message}</p>}
      </div>
      {onDismiss && (
        <button className="error-banner-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}
