// Taça Guaraná — tiny WebAudio sound effects, no asset files. Cup-hit "thunk" and
// win fanfare, plus a haptic buzz where supported. The AudioContext is created
// lazily on the first sound, which always follows a click/keypress, so it
// satisfies browser autoplay rules. See CLAUDE.md §4C (Placar feedback).

let ctx = null

function ac() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function buzz(pattern) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported — non-fatal */
  }
}

// Short percussive thunk: a fast downward pitch sweep into a click.
export function playHit() {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(420, t)
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.12)
  gain.gain.setValueAtTime(0.35, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  osc.connect(gain).connect(a.destination)
  osc.start(t)
  osc.stop(t + 0.2)
  buzz(35)
}

// Ping-pong ball bounce-and-drop: a few quick high blips that accelerate and
// fade (the ball skipping), then a soft low "plop" as it lands in the cup.
export function playBounce() {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const skips = [0, 0.07, 0.12, 0.155]
  skips.forEach((dt, i) => {
    const osc = a.createOscillator()
    const gain = a.createGain()
    const ti = t + dt
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1400 - i * 120, ti)
    gain.gain.setValueAtTime(0.18 / (i + 1), ti)
    gain.gain.exponentialRampToValueAtTime(0.0008, ti + 0.04)
    osc.connect(gain).connect(a.destination)
    osc.start(ti)
    osc.stop(ti + 0.05)
  })
  // Landing plop.
  const osc = a.createOscillator()
  const gain = a.createGain()
  const tp = t + 0.2
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(180, tp)
  osc.frequency.exponentialRampToValueAtTime(90, tp + 0.1)
  gain.gain.setValueAtTime(0.25, tp)
  gain.gain.exponentialRampToValueAtTime(0.001, tp + 0.16)
  osc.connect(gain).connect(a.destination)
  osc.start(tp)
  osc.stop(tp + 0.18)
  buzz(35)
}

// Rising C–E–G–C fanfare on a win.
export function playWin() {
  const a = ac()
  if (!a) return
  const t = a.currentTime
  const notes = [523.25, 659.25, 783.99, 1046.5]
  notes.forEach((f, i) => {
    const osc = a.createOscillator()
    const gain = a.createGain()
    const ti = t + i * 0.12
    osc.type = 'square'
    osc.frequency.setValueAtTime(f, ti)
    gain.gain.setValueAtTime(0.0001, ti)
    gain.gain.linearRampToValueAtTime(0.3, ti + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, ti + 0.3)
    osc.connect(gain).connect(a.destination)
    osc.start(ti)
    osc.stop(ti + 0.32)
  })
  buzz([60, 40, 120])
}
