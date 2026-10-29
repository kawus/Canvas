import { useEffect, useSyncExternalStore } from 'react'
import { routeFromHash, startPersistence } from './boards'
import { Canvas } from './components/Canvas'
import { EmptyHint, HistoryControls, Toast, ZoomControls } from './components/Corners'
import { StylePanel } from './components/StylePanel'
import { TextEditor } from './components/TextEditor'
import { Toolbar } from './components/Toolbar'
import { BoardMenu, ExportButton, ShareButton } from './components/TopBar'
import { PALETTE_DARK, PALETTE_LIGHT } from './constants'
import { startKeyboard } from './keyboard'
import { useStore } from './store'

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
const subscribeDark = (cb: () => void) => {
  darkQuery.addEventListener('change', cb)
  return () => darkQuery.removeEventListener('change', cb)
}

export default function App() {
  const theme = useStore((s) => s.theme)
  const loaded = useStore((s) => s.loaded)
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
    return () => {
      stopPersist()
      stopKeys()
    }
  }, [])

  return (
    <div className={`app ${loaded ? 'is-loaded' : ''}`}>
      <Canvas palette={palette} />
      <TextEditor palette={palette} />
      <EmptyHint />

      <div className="top-left">
        <BoardMenu />
      </div>
      <div className="top-right">
        <ExportButton />
        <ShareButton />
      </div>

      <div className="bottom">
        <StylePanel palette={palette} />
        <Toast />
        <Toolbar />
      </div>
      <div className="bottom-left">
        <HistoryControls />
        <ZoomControls />
      </div>
    </div>
  )
}
