export function Skeleton() {
  return (
    <div className="skeleton-root" aria-busy="true">
      <div className="sk sk-line w40" />
      <div className="sk sk-block" />
      <div className="sk sk-row" />
      <div className="sk sk-block h120" />
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button onClick={onRetry}>Retry</button>
    </div>
  )
}

export function GapChip({ flag }: { flag: string }) {
  return (
    <div className="gap-chip" role="status">
      ⚠ no usable forecast for this day ({flag}) — accuracy unavailable
    </div>
  )
}
