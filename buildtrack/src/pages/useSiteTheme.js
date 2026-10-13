import { useState, useEffect } from 'react'

// Light/dark switch for the public pages (landing, install). It deliberately
// does not use the app store: those pages are prerendered at build time, and the
// store reads browser storage the moment it is imported. The choice is saved
// under the same key and attribute the store uses, so the app opens in the same
// theme. The first render is always dark (the default) so server and browser
// markup match; the real value is applied right after mount.
export function useSiteTheme() {
  const [theme, setTheme] = useState('dark')

  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark')
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('tutuu_theme', next) } catch { /* storage blocked */ }
    if (next === 'light') document.documentElement.setAttribute('data-theme', 'light')
    else document.documentElement.removeAttribute('data-theme')
    setTheme(next)
  }

  return { theme, toggleTheme }
}
