import { useEffect, useSyncExternalStore } from 'react'
import { routeFromHash, startPersistence } from './boards'
import { Canvas } from './components/Canvas'
import { EmptyHint, HistoryControls, Toast, ZoomControls } from './components/Corners'
import { PeerAvatars, PeerCursors } from './components/Presence'
import { StylePanel } from './components/StylePanel'
import { TextEditor } from './components/TextEditor'
import { Toolbar } from './components/Toolbar'
import { BoardMenu, ExportButton, ShareButton } from './components/TopBar'
import { InsertDialog } from './components/Insert'
import { StatsPage } from './components/Stats'
import { UpgradeDialog, ViewBar } from './components/Upgrade'
import { PALETTE_DARK, PALETTE_LIGHT } from './constants'
import { startKeyboard } from './keyboard'
import { claimFromUrl, refreshPro } from './pro'
import { useStore } from './store'

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
  const statsView = useSyncExternalStore(subscribeHash, () => location.hash === '#stats')
  const systemDark = useSyncExternalStore(subscribeDark, () => darkQuery.matches)
  const dark = theme === 'dark' || (theme === 'system' && systemDark)
  const palette = dark ? PALETTE_DARK : PALETTE_LIGHT

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#161618' : '#fbfbfb')
  }, [dark])

  useEffect(() => {
    const stopPersist = startPersistence()
    const stopKeys = startKeyboard()
    void routeFromHash()
    // back from Stripe Checkout, then learn whether this device has Pro
    void claimFromUrl().then(refreshPro)
    return () => {
      stopPersist()
      stopKeys()
    }
  }, [])

  if (statsView) return <StatsPage />

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
        {!viewOnly && <StylePanel palette={palette} />}
        <Toast />
        {viewOnly ? <ViewBar /> : <Toolbar />}
      </div>
      <UpgradeDialog />
      <InsertDialog />
      <div className="bottom-left">
        <HistoryControls />
        <ZoomControls />
      </div>
    </div>
  )
}
