import { useEffect, useRef, useState } from 'react'

const TERMS: { term: string; def: string }[] = [
  {
    term: 'Delivery day',
    def: 'The day the electricity is actually consumed and settled (the day the forecast is for).',
  },
  {
    term: 'Decision revision',
    def: 'The latest forecast that covers the whole delivery day and was published by 13:00 UTC on D-1 — the information the desk legitimately had when bidding.',
  },
  {
    term: 'Auto',
    def: 'Use the decision revision selected by the rule above. This is the default view.',
  },
  {
    term: 'Revision / lead time',
    def: 'One forecast issue, identified by its publish time. D-1 means published the day before delivery; D-2 is two days before; D and D+1 are the delivery day and the day after.',
  },
  {
    term: 'Overlay revision',
    def: 'An optional second forecast vintage drawn as a dashed line, so you can compare two issues of the same delivery day.',
  },
  {
    term: 'Gap',
    def: 'No usable forecast exists for that delivery day, so accuracy cannot be scored.',
  },
]

const METRICS: { term: string; def: string }[] = [
  { term: 'MAE', def: 'Mean absolute error: the average size of the miss, in MW.' },
  { term: 'RMSE', def: 'Root-mean-square error, in MW: like MAE but penalises large misses more heavily.' },
  { term: 'MAPE', def: 'Mean absolute percentage error: the average miss as a percentage of actual wind output.' },
  {
    term: 'Bias',
    def: 'Average forecast minus actual, in MW. Positive means over-forecasting (shown amber); negative means under-forecasting.',
  },
  {
    term: 'Scored hours',
    def: 'Hours where both an actual and a forecast exist and the actual is at least 1 MW. Metrics only use these hours.',
  },
]

function TermList({ items }: { items: { term: string; def: string }[] }) {
  return (
    <dl className="glossary-list">
      {items.map((t) => (
        <div key={t.term} className="glossary-item">
          <dt>{t.term}</dt>
          <dd>{t.def}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Glossary() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const close = () => { setOpen(false); triggerRef.current?.focus() }

  return (
    <>
      <button ref={triggerRef} type="button" className="glossary-trigger"
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span aria-hidden="true">?</span> Glossary
      </button>
      {open && (
        <div className="modal-backdrop" onClick={close}>
          <div className="glossary" role="dialog" aria-modal="true" aria-labelledby="glossary-title"
            onClick={(e) => e.stopPropagation()}>
            <div className="glossary-head">
              <div>
                <h2 id="glossary-title">Glossary</h2>
                <p className="glossary-sub">Plain-English definitions for the labels on this page.</p>
              </div>
              <button ref={closeRef} type="button" className="glossary-close"
                aria-label="Close glossary" onClick={close}>×</button>
            </div>
            <h3>Forecasts and revisions</h3>
            <TermList items={TERMS} />
            <h3>Accuracy metrics</h3>
            <TermList items={METRICS} />
          </div>
        </div>
      )}
    </>
  )
}
