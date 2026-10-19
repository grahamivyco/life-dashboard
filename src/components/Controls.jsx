// The one control row every page uses, right under the page title:
//   [tabs] [view menus]                     [round icon buttons] [one primary action]
// Tabs pick the page's section. Anything else that changes what's shown is a ViewMenu.
// Icon actions (refresh, sync, search) are RoundButtons. A page has at most one primary pill.
export function Controls({ children, end }) {
  return (
    <div className="controls">
      {children}
      {end && <div className="controls-end">{end}</div>}
    </div>
  )
}

export function Tabs({ tabs, value, onPick }) {
  return (
    <div className="seg tabs-seg" role="tablist">
      {tabs.map((t) => (
        <button key={t.k} role="tab" aria-pressed={value === t.k} aria-selected={value === t.k} onClick={() => onPick(t.k)}>
          {t.label}{t.n ? <span className="seg-n hot">{t.n}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function RoundButton({ label, on, children, ...props }) {
  return <button className={'icon-btn round-btn' + (on ? ' on' : '')} aria-label={label} title={label} {...props}>{children}</button>
}

// What a whole page or view shows when it has nothing: a card with a short headline and one line.
// Inside a tile, a quiet <p className="empty"> line is enough.
export function Empty({ title, children }) {
  return <section className="tile empty-card"><b>{title}</b>{children && <span className="meta">{children}</span>}</section>
}
