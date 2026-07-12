'use client'

import { useState } from 'react'
import { Check, RotateCcw, Sparkles, Sword } from 'lucide-react'

const items = [
  { id: 'candle', label: 'Candle', mark: 'C' },
  { id: 'glove', label: 'Glove', mark: 'G' },
  { id: 'raft', label: 'Raft', mark: 'R' },
  { id: 'boots', label: 'Boots', mark: 'B' },
  { id: 'flute', label: 'Flute', mark: 'F' },
  { id: 'cross', label: 'Cross', mark: 'X' },
  { id: 'hammer', label: 'Hammer', mark: 'H' },
  { id: 'key', label: 'Magic Key', mark: 'K' },
]

const spells = ['Shield', 'Jump', 'Life', 'Fairy', 'Fire', 'Reflect', 'Spell', 'Thunder']

export function TrackerShell() {
  const [collected, setCollected] = useState<string[]>(['candle', 'boots', 'hammer'])
  const [learned, setLearned] = useState<string[]>(['Shield', 'Jump', 'Fairy'])

  const toggle = (value: string, values: string[], update: (next: string[]) => void) => {
    update(values.includes(value) ? values.filter((item) => item !== value) : [...values, value])
  }

  return (
    <main className="min-h-screen bg-background px-3 py-5 text-foreground sm:px-6 sm:py-8">
      <section className="mx-auto flex w-full max-w-md flex-col border border-border bg-card shadow-[6px_6px_0_var(--shadow)]">
        <header className="flex items-start justify-between border-b border-border p-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-primary">
              <Sword aria-hidden="true" className="size-4" strokeWidth={2.5} />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.2em]">Randomizer log</span>
            </div>
            <div>
              <h1 className="font-sans text-4xl font-black uppercase leading-none tracking-[-0.06em] text-balance">
                Zelda II
              </h1>
              <p className="mt-1 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">Adventure tracker / portrait</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setCollected([]); setLearned([]) }}
            className="flex size-10 items-center justify-center border border-border bg-background text-foreground transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Reset tracker"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
          </button>
        </header>

        <div className="grid grid-cols-3 border-b border-border">
          <Stat label="Items" value={`${collected.length}/8`} />
          <Stat label="Spells" value={`${learned.length}/8`} bordered />
          <Stat label="Palaces" value="2/7" />
        </div>

        <TrackerSection index="01" title="Quest items" detail="Tap to mark found">
          <div className="grid grid-cols-4 gap-2">
            {items.map((item) => {
              const active = collected.includes(item.id)
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => toggle(item.id, collected, setCollected)}
                  aria-pressed={active}
                  className={`group flex aspect-square flex-col items-center justify-center gap-1 border font-mono transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground'}`}
                >
                  <span className="text-2xl font-black leading-none">{item.mark}</span>
                  <span className="max-w-full truncate px-1 text-[9px] font-semibold uppercase tracking-wider">{item.label}</span>
                </button>
              )
            })}
          </div>
        </TrackerSection>

        <TrackerSection index="02" title="Magic" detail="Known spells">
          <div className="grid grid-cols-2 gap-2">
            {spells.map((spell, index) => {
              const active = learned.includes(spell)
              return (
                <button
                  type="button"
                  key={spell}
                  onClick={() => toggle(spell, learned, setLearned)}
                  aria-pressed={active}
                  className={`flex items-center justify-between border px-3 py-3 text-left font-mono text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${active ? 'border-foreground bg-foreground text-background' : 'border-border bg-background text-muted-foreground hover:text-foreground'}`}
                >
                  <span>{String(index + 1).padStart(2, '0')} / {spell}</span>
                  {active && <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
        </TrackerSection>

        <footer className="flex items-center justify-between border-t border-border bg-secondary px-5 py-4 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
          <span>Seed in progress</span>
          <span className="flex items-center gap-2"><Sparkles aria-hidden="true" className="size-3 text-accent" /> Style draft 01</span>
        </footer>
      </section>
    </main>
  )
}

function Stat({ label, value, bordered = false }: { label: string; value: string; bordered?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 p-4 ${bordered ? 'border-x border-border' : ''}`}>
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <strong className="font-sans text-2xl font-black tracking-tight">{value}</strong>
    </div>
  )
}

function TrackerSection({ index, title, detail, children }: { index: string; title: string; detail: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-border p-5">
      <div className="flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] font-bold text-primary">{index}</span>
          <h2 className="font-sans text-xl font-black uppercase tracking-tight">{title}</h2>
        </div>
        <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{detail}</p>
      </div>
      {children}
    </section>
  )
}
