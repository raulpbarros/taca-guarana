// Situation gifs for the Placar. Glob-imported from assets/ so Vite bundles them
// and any new .gif dropped into one of these folders is auto-detected on the next
// build — no filename list to maintain.
//   point-gifs/{point-gif,b2b,revenge,hat-trick}  -> per-make moment
//   win-gifs/*                                     -> a match is won
//   special-gifs/*                                 -> long stall (no points 8min+)
const modules = import.meta.glob('../assets/gifs/**/*.gif', {
  eager: true,
  query: '?url',
  import: 'default',
})

const buckets = { point: [], b2b: [], revenge: [], hatTrick: [], win: [], special: [] }
const subToCat = {
  'point-gif': 'point',
  b2b: 'b2b',
  revenge: 'revenge',
  'hat-trick': 'hatTrick',
}

for (const [path, url] of Object.entries(modules)) {
  const rel = path.split('/gifs/')[1] // e.g. "point-gifs/b2b/x.gif" or "win-gifs/x.gif"
  if (!rel) continue
  const parts = rel.split('/')
  let cat = null
  if (parts[0] === 'point-gifs') cat = subToCat[parts[1]]
  else if (parts[0] === 'win-gifs') cat = 'win'
  else if (parts[0] === 'special-gifs') cat = 'special'
  if (cat && buckets[cat]) buckets[cat].push(url)
}

// Random gif url for a category, or null if that folder is empty.
export function randomGif(category) {
  const list = buckets[category]
  if (!list || list.length === 0) return null
  return list[Math.floor(Math.random() * list.length)]
}
