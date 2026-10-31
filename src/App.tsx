import { Analytics } from '@vercel/analytics/react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { pageOnly } from './analytics'
import { routeFromHash, startPersistence } from './boards'
import { Canvas } from './components/Canvas'
import { EmptyHint, HistoryControls, Toast, ZoomControls } from './components/Corners'
import { PeerAvatars, PeerCursors } from './components/Presence'
import { StylePanel } from './components/StylePanel'
import { TextEditor } from './components/TextEditor'
import { Toolbar } from './components/Toolbar'
import { BoardMenu, ExportButton, ShareButton } from './components/TopBar'
import { HelpButton, ShortcutsDialog } from './components/HelpButton'
import { CropOverlay } from './components/CropOverlay'
import { InsertDialog } from './components/Insert'
import { LibraryDialogs } from './components/Library'
import { StatsPage } from './components/Stats'
import { UpgradeDialog, ViewBar } from './components/Upgrade'
import { Welcome } from './components/Welcome'
import { PALETTE_DARK, PALETTE_LIGHT } from './constants'
import { startKeyboard } from './keyboard'
import { shouldWelcome } from './onboarding'
import { initLibrary } from './library'
import { claimFromUrl, refreshPro } from './pro'
import { useStore } from './store'
import { startUpdates } from './updates'

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const subscribeDark = (cb: () => void) => {
  darkQuery.addEventListener('change', cb)
  return () => darkQuery.removeEventListener('change', cb)
}

export default function App() {
  const theme = useStore((s) => s.theme)
  const loaded = useStore((s) => s.loaded)
  const viewOnly = useStore((s) => s.loaded && !s.doc.key)
  const cropping = useStore((s) => !!s.cropId)
  const statsView = useSyncExternalStore(subscribeHash, () => location.hash === '#stats')
  const systemDark = useSyncExternalStore(subscribeDark, () => darkQuery.matches)
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  const palette = dark ? PALETTE_DARK : PALETTE_LIGHT
  // first run: the welcome tour, once the person's own board is open
  const [welcomeDone, setWelcomeDone] = useState(false)
  const ownBoard = useStore((s) => s.loaded && !!s.doc.key)
  const replay = useStore((s) => s.tour)
  const welcome = (shouldWelcome() && ownBoard && !welcomeDone) || replay

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#161618' : '#fbfbfb')
  }, [dark])

  useEffect(() => {
    const stopPersist = startPersistence()
    const stopKeys = startKeyboard()
    // keep the My Canvas backup in step once the first board is open
    void routeFromHash().then(initLibrary)
    // back from Stripe Checkout, then learn whether this device has Pro
    void claimFromUrl().then(refreshPro)
    startUpdates()
    return () => {
      stopPersist()
      stopKeys()
    }
  }, [])

  if (statsView)
    return (
      <>
        <StatsPage />
        <Analytics beforeSend={pageOnly} />
      </>
    )

  return (
    <div className={`app ${loaded ? 'is-loaded' : ''}`}>
      <Canvas palette={palette} />
      <TextEditor palette={palette} />
      <PeerCursors />
      <EmptyHint />

      <div className="top-left">
        <BoardMenu />
      </div>
      <div className="top-right">
        <PeerAvatars />
        <ExportButton />
        <ShareButton />
      </div>

      <div className="bottom">
        {!viewOnly && !cropping && <StylePanel palette={palette} />}
        <Toast />
        {viewOnly ? <ViewBar /> : !cropping && <Toolbar />}
      </div>
      <UpgradeDialog />
      <InsertDialog />
      <CropOverlay />
      <LibraryDialogs />
      <Analytics beforeSend={pageOnly} />
      {welcome && (
        <Welcome
          onClose={() => {
            setWelcomeDone(true)
            useStore.getState().setTour(false)
          }}
        />
      )}
      <div className="bottom-right">
        <HelpButton />
      </div>
      <ShortcutsDialog />
      <div className="bottom-left">
        <HistoryControls />
        <ZoomControls />
      </div>
    </div>
  )
}
