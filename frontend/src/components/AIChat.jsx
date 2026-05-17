import { useState, useRef, useEffect, useCallback } from 'react'

const SUGGESTIONS = [
  'Are there any emergency flights right now?',
  'Which airline has the most flights?',
  'What\'s the average cruising altitude?',
  'How many countries are currently in the air?',
]

const SELECTED_SUGGESTIONS = [
  'Tell me about the selected flight.',
  'Is this flight on time?',
  'What type of aircraft is this?',
]

function buildContext(flights, selected) {
  const airborne  = flights.filter(f => !f.onGround)
  const onGround  = flights.filter(f =>  f.onGround)
  const emergency = flights.filter(f => ['7500','7600','7700'].includes(String(f.squawk)))
  const countries = new Set(flights.map(f => f.origin).filter(Boolean)).size

  // Airline counts
  const counts = {}
  for (const f of flights) {
    const code = f.callsign?.trim().toUpperCase().match(/^([A-Z]{3})\d/)?.[1]
    if (code) counts[code] = (counts[code] || 0) + 1
  }
  const topAirlines = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([c, n]) => `${c}(${n})`)

  const alts   = airborne.map(f => f.alt).filter(a => a != null)
  const speeds = airborne.map(f => f.speed).filter(s => s != null)
  const avgAlt   = alts.length   ? Math.round(alts.reduce((a,b)=>a+b,0)   / alts.length   * 3.28084) : null
  const avgSpeed = speeds.length ? Math.round(speeds.reduce((a,b)=>a+b,0) / speeds.length * 1.94384) : null

  const ctx = { total: flights.length, inAir: airborne.length, onGround: onGround.length, countries, emergencies: emergency.length, topAirlines, avgAlt, avgSpeed }

  if (selected) {
    ctx.selected = {
      callsign: selected.callsign?.trim() || selected.icao24,
      alt:      selected.alt   != null ? Math.round(selected.alt   * 3.28084) : null,
      speed:    selected.speed != null ? Math.round(selected.speed * 1.94384) : null,
      heading:  selected.heading,
      origin:   selected.origin,
    }
  }

  return ctx
}

export default function AIChat({ flights, selected }) {
  const [open,     setOpen]     = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', text: "Hi! I'm FlightScope AI. Ask me anything about current global air traffic, or click a suggestion below." },
  ])
  const [input,   setInput]   = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      inputRef.current?.focus()
    }
  }, [messages, open])

  const send = useCallback(async (question) => {
    const q = (question ?? input).trim()
    if (!q || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: q }])
    setLoading(true)
    try {
      const res  = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ question: q, context: buildContext(flights, selected) }),
      })
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', text: data.answer, error: data.error }])
    } catch {
      setMessages(m => [...m, { role: 'assistant', text: "Couldn't reach the AI service — is the backend running?", error: true }])
    } finally {
      setLoading(false)
    }
  }, [input, loading, flights, selected])

  const suggestions = selected ? SELECTED_SUGGESTIONS : SUGGESTIONS

  return (
    <>
      <button
        className={`ai-fab${open ? ' ai-fab--open' : ''}`}
        onClick={() => setOpen(o => !o)}
        title="FlightScope AI"
      >
        <span className="ai-fab-icon">✦</span>
        {!open && <span className="ai-fab-label">AI</span>}
      </button>

      {open && (
        <div className="ai-panel">
          <div className="ai-panel-header">
            <div className="ai-panel-title">
              <span className="ai-panel-icon">✦</span>
              FlightScope AI
            </div>
            <span className="ai-powered">Qwen 2.5 · Hugging Face</span>
            <button className="ai-close" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="ai-messages">
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg--${m.role}${m.error ? ' ai-msg--error' : ''}`}>
                {m.role === 'assistant' && <span className="ai-msg-icon">✦</span>}
                <span>{m.text}</span>
              </div>
            ))}
            {loading && (
              <div className="ai-msg ai-msg--assistant">
                <span className="ai-msg-icon">✦</span>
                <span className="ai-typing"><span /><span /><span /></span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="ai-suggestions">
            {suggestions.map(s => (
              <button key={s} className="ai-chip" onClick={() => send(s)} disabled={loading}>
                {s}
              </button>
            ))}
          </div>

          <div className="ai-input-row">
            <input
              ref={inputRef}
              className="ai-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about current flights…"
              disabled={loading}
            />
            <button
              className="ai-send"
              onClick={() => send()}
              disabled={loading || !input.trim()}
            >↑</button>
          </div>
        </div>
      )}
    </>
  )
}
