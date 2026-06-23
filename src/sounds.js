// Sound files for Taça Guaraná. Glob-imported so dropping a new .mp3 into
// assets/sounds/point-sounds/ or win-sounds/ auto-includes it on next build.
const modules = import.meta.glob('../assets/sounds/**/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
})

const buckets = { point: [], win: [] }

for (const [path, url] of Object.entries(modules)) {
  if (path.includes('/point-sounds/')) buckets.point.push(url)
  else if (path.includes('/win-sounds/')) buckets.win.push(url)
}

function pick(list) {
  if (!list || list.length === 0) return null
  return list[Math.floor(Math.random() * list.length)]
}

let currentAudio = null

function playUrl(url) {
  if (!url) return
  try {
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
    }
    const audio = new Audio(url)
    audio.volume = 0.8
    audio.play().catch(() => {})
    currentAudio = audio
  } catch {
    /* non-fatal */
  }
}

export function playPointSound() {
  playUrl(pick(buckets.point))
}

export function playWinSound() {
  playUrl(pick(buckets.win))
}
