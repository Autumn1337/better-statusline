// Streams the player's state to stderr as JSON lines, one on each change and on each seek; `null` while nothing is
// loaded. A player's own notice of a play, a pause or a new track wakes it at once, as does an app opening or
// quitting; between them it reads again every few seconds for what no notice carries (a seek, the volume, shuffle,
// repeat), less often while nothing plays.
ObjC.import('AppKit')

// The players this Mac has installed, by bundle id.
const PLAYERS = { Spotify: 'com.spotify.client', Music: 'com.apple.Music' }
// What each player posts as what it plays changes.
const NOTICES = ['com.spotify.client.PlaybackStateChanged', 'com.apple.Music.playerInfo']
const LAUNCHES = ['NSWorkspaceDidLaunchApplicationNotification', 'NSWorkspaceDidTerminateApplicationNotification']
// Seconds between readings while a track plays, and while none does.
const PLAYING = 5
const RESTING = 30
const apps = Object.fromEntries(
  Object.entries(PLAYERS)
    .filter(([, id]) => !$.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier(id).isNil())
    .map(([name, id]) => [name, Application(id)]),
)
let current = 'Spotify'
let last = null
let isWoken = false

ObjC.registerSubclass({
  name: 'NowPlayingWake',
  methods: {
    'wake:': {
      types: ['void', ['id']],
      implementation: () => {
        isWoken = true
      },
    },
  },
})

function sample(name) {
  const app = apps[name]
  const state = app.playerState()
  if (state === 'stopped') return null
  const track = app.currentTrack
  const isSpotify = name === 'Spotify'
  return {
    app: name,
    state: state === 'paused' ? 'paused' : 'playing',
    track: {
      id: isSpotify ? track.id() : track.persistentID(),
      title: track.name(),
      artist: track.artist(),
      album: track.album(),
      duration: Math.round(isSpotify ? track.duration() / 1000 : track.duration()),
      artwork: isSpotify ? track.artworkUrl() : null,
    },
    position: Math.round(app.playerPosition() * 10) / 10,
    at: Date.now(),
    volume: app.soundVolume(),
    shuffle: isSpotify ? app.shuffling() : app.shuffleEnabled(),
    repeat: isSpotify ? (app.repeating() ? 'all' : 'off') : app.songRepeat(),
  }
}

// Only a running player is asked anything: asking one that is not running would launch it.
function pick() {
  const running = Object.keys(apps).filter(name => apps[name].running())
  current =
    running.find(name => apps[name].playerState() === 'playing') ??
    (running.includes(current) ? current : running[0])
  return current === undefined ? null : sample(current)
}

// A reading is news when anything but the clock moved, or the clock moved other than by playing.
function isNews(now) {
  if (now === null || last === null) return now !== last
  const { position, at, ...rest } = now
  const { position: was, at: then, ...before } = last
  const expected = was + (last.state === 'playing' ? (at - then) / 1000 : 0)
  return JSON.stringify(rest) !== JSON.stringify(before) || Math.abs(position - expected) > 1.5
}

// Sleeps until a notice wakes it or `seconds` pass; after a notice, a beat more, so the track's details have caught up
// with it before they are read.
function rest(seconds) {
  const until = $.NSDate.dateWithTimeIntervalSinceNow(seconds)
  isWoken = false
  while (!isWoken && until.timeIntervalSinceNow > 0) $.NSRunLoop.currentRunLoop.runModeBeforeDate($.NSDefaultRunLoopMode, until)
  if (isWoken) delay(0.4)
}

function run() {
  const wake = $.NowPlayingWake.alloc.init
  for (const name of NOTICES) $.NSDistributedNotificationCenter.defaultCenter.addObserverSelectorNameObject(wake, 'wake:', name, $())
  for (const name of LAUNCHES) $.NSWorkspace.sharedWorkspace.notificationCenter.addObserverSelectorNameObject(wake, 'wake:', name, $())
  for (;;) {
    try {
      const now = pick()
      if (isNews(now)) console.log(JSON.stringify((last = now)))
    } catch {
      // An app launching, quitting or changing tracks misses a reading.
    }
    rest(last?.state === 'playing' ? PLAYING : RESTING)
  }
}
