export default function ToastList({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toast-list">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>{t.msg}</div>
      ))}
    </div>
  )
}
