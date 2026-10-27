'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const STORAGE_KEY = 'crats-theme'

/** The `dark` class lives on <html> (set before first paint by the inline script in the root layout). */
export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    } catch {
      // storage can be blocked; the theme still switches for this visit
    }
  }

  return (
    <button aria-label="Toggle theme" title="Toggle theme" onClick={toggle} className="rounded-lg border p-2 hover:bg-muted">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
