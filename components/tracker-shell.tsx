'use client'

import { useState } from 'react'
import { Check, ChevronDown, RotateCcw, Shield, Sword } from 'lucide-react'

type CheckItem = { id: string; label: string; hint?: string }
type Group = { id: string; title: string; subtitle: string; checks: CheckItem[] }

const inventory: CheckItem[] = [
  { id: 'candle', label: 'Candle' }, { id: 'glove', label: 'Glove' },
  { id: 'raft', label: 'Raft' }, { id: 'boots', label: 'Boots' },
  { id: 'flute', label: 'Flute' }, { id: 'cross', label: 'Cross' },
  { id: 'hammer', label: 'Hammer' }, { id: 'magic-key', label: 'Magic Key' },
]

const spells: CheckItem[] = ['Shield', 'Jump', 'Life', 'Fairy', 'Fire', 'Reflect', 'Spell', 'Thunder'].map((label) => ({ id: `spell-${label.toLowerCase()}`, label }))
const techniques: CheckItem[] = [{ id: 'downstab', label: 'Downstab' }, { id: 'upstab', label: 'Upstab' }]

const towns: Group[] = [
  { id: 'rauru', title: 'Rauru', subtitle: 'Western Hyrule', checks: [{ id: 'rauru-shield', label: 'Shield spell', hint: 'Meet the wise man' }] },
  { id: 'ruto', title: 'Ruto', subtitle: 'Western Hyrule', checks: [{ id: 'ruto-jump', label: 'Jump spell', hint: 'Return the trophy' }] },
  { id: 'saria', title: 'Saria', subtitle: 'Western Hyrule', checks: [{ id: 'saria-life', label: 'Life spell', hint: 'Return the mirror' }] },
  { id: 'mido', title: 'Mido', subtitle: 'Western Hyrule', checks: [{ id: 'mido-fairy', label: 'Fairy spell', hint: 'Return the medicine' }, { id: 'mido-downstab', label: 'Downstab', hint: 'Knight above the church' }] },
  { id: 'nabooru', title: 'Nabooru', subtitle: 'Eastern Hyrule', checks: [{ id: 'nabooru-fire', label: 'Fire spell', hint: 'Bring water to the thirsty woman' }] },
  { id: 'darunia', title: 'Darunia', subtitle: 'Eastern Hyrule', checks: [{ id: 'darunia-reflect', label: 'Reflect spell', hint: 'Rescue the kidnapped child' }, { id: 'darunia-upstab', label: 'Upstab', hint: 'Knight above the rooftops' }] },
  { id: 'new-kasuto', title: 'New Kasuto', subtitle: 'Hidden forest town', checks: [{ id: 'kasuto-spell', label: 'Spell spell', hint: 'Meet the wise man' }, { id: 'kasuto-key', label: 'Magic Key', hint: 'Hidden house' }, { id: 'kasuto-container', label: 'Magic container', hint: 'Old woman reward' }] },
  { id: 'old-kasuto', title: 'Old Kasuto', subtitle: 'Desert ruins', checks: [{ id: 'old-kasuto-thunder', label: 'Thunder spell', hint: 'Hidden wise man' }] },
]

const caves: Group[] = [
  { id: 'west-caves', title: 'Western Hyrule', subtitle: 'Vanilla item caves', checks: [
    { id: 'parapa-cave', label: 'Parapa desert cave', hint: 'Heart container' },
    { id: 'trophy-cave', label: 'Trophy cave', hint: 'Trophy' },
    { id: 'medicine-cave', label: 'Medicine cave', hint: 'Medicine' },
    { id: 'hammer-cave', label: 'Death Mountain cave', hint: 'Hammer' },
    { id: 'dm-magic', label: 'Death Mountain cave', hint: 'Magic container' },
  ] },
  { id: 'maze-caves', title: 'Maze Island', subtitle: 'Island collectibles', checks: [
    { id: 'maze-child', label: 'Hidden cave', hint: 'Kidnapped child' },
    { id: 'maze-container', label: 'Island cave', hint: 'Magic container' },
  ] },
  { id: 'east-caves', title: 'Eastern Hyrule', subtitle: 'Vanilla item caves', checks: [
    { id: 'east-heart', label: 'Desert cave', hint: 'Heart container' },
    { id: 'east-magic', label: 'Hidden cave', hint: 'Magic container' },
    { id: 'three-eye', label: 'Three-eye rock cave', hint: 'Heart container' },
  ] },
]

const allLocationChecks = [...towns, ...caves].flatMap((group) => group.checks)

export function TrackerShell() {
  const [checked, setChecked] = useState<string[]>([])
  const [openGroups, setOpenGroups] = useState<string[]>(['rauru', 'west-caves'])
  const [confirmReset, setConfirmReset] = useState(false)

  const toggleCheck = (id: string) => setChecked((values) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id])
  const toggleGroup = (id: string) => setOpenGroups((values) => values.includes(id) ? values.filter((value) => value !== id) : [...values, id])
  const locationDone = allLocationChecks.filter((check) => checked.includes(check.id)).length

  function reset() {
    if (checked.length === 0) return
    if (!confirmReset) { setConfirmReset(true); return }
    setChecked([])
    setConfirmReset(false)
  }

  return (
    <main className="min-h-screen bg-background px-2 py-4 text-foreground sm:px-5 sm:py-8">
      <section className="pixel-frame mx-auto flex w-full max-w-md flex-col bg-card">
        <header className="border-b-4 border-primary px-4 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-accent">
                <Sword aria-hidden="true" className="size-4" /> Randomizer checklist
              </div>
              <div>
                <h1 className="text-shadow-pixel font-mono text-[28px] font-black uppercase leading-none tracking-[-0.08em] text-primary sm:text-4xl">Adventure of Link</h1>
                <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Items · Towns · Overworld caves</p>
              </div>
            </div>
            <button type="button" onClick={reset} className={`pixel-button flex min-h-11 min-w-11 items-center justify-center border-2 px-2 font-mono text-[9px] font-black uppercase ${confirmReset ? 'border-accent bg-accent text-accent-foreground' : 'border-muted-foreground bg-secondary text-foreground'}`} aria-label={confirmReset ? 'Confirm reset tracker' : 'Reset tracker'}>
              {confirmReset ? 'Sure?' : <RotateCcw aria-hidden="true" className="size-4" />}
            </button>
          </div>
          <div className="mt-5 flex items-center gap-3 border-2 border-muted-foreground bg-background p-3">
            <Shield aria-hidden="true" className="size-5 text-accent" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex justify-between font-mono text-[10px] font-black uppercase"><span>Location progress</span><span className="text-accent">{locationDone}/{allLocationChecks.length}</span></div>
              <div className="h-2 border border-muted-foreground bg-secondary"><div className="h-full bg-accent transition-[width]" style={{ width: `${allLocationChecks.length ? (locationDone / allLocationChecks.length) * 100 : 0}%` }} /></div>
            </div>
          </div>
        </header>

        <DenseSection number="I" title="Inventory">
          <div className="grid grid-cols-4 gap-2">
            {inventory.map((item) => <ItemTile key={item.id} item={item} active={checked.includes(item.id)} onToggle={toggleCheck} />)}
          </div>
        </DenseSection>

        <DenseSection number="M" title="Magic & skill">
          <div className="grid grid-cols-2 gap-2">
            {[...spells, ...techniques].map((item) => <CheckRow key={item.id} item={item} active={checked.includes(item.id)} onToggle={toggleCheck} compact />)}
          </div>
        </DenseSection>

        <GroupSection number="T" title="Town checks" groups={towns} checked={checked} openGroups={openGroups} onCheck={toggleCheck} onGroup={toggleGroup} />
        <GroupSection number="C" title="Overworld caves" groups={caves} checked={checked} openGroups={openGroups} onCheck={toggleCheck} onGroup={toggleGroup} />

        <footer className="flex items-center justify-between border-t-4 border-primary bg-secondary px-4 py-4 font-mono text-[9px] font-black uppercase tracking-[0.12em] text-muted-foreground">
          <span>Session only</span><span>{checked.length} marks</span>
        </footer>
      </section>
    </main>
  )
}

function DenseSection({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return <section className="border-b-2 border-muted-foreground px-4 py-5"><SectionTitle number={number} title={title} />{children}</section>
}

function SectionTitle({ number, title }: { number: string; title: string }) {
  return <div className="mb-4 flex items-center gap-3"><span className="flex size-6 items-center justify-center bg-primary font-mono text-xs font-black text-primary-foreground">{number}</span><h2 className="font-mono text-base font-black uppercase tracking-[-0.04em] text-accent">{title}</h2><span className="h-0.5 flex-1 bg-muted-foreground" /></div>
}

function ItemTile({ item, active, onToggle }: { item: CheckItem; active: boolean; onToggle: (id: string) => void }) {
  return <button type="button" onClick={() => onToggle(item.id)} aria-pressed={active} className={`pixel-button flex aspect-square min-h-16 flex-col items-center justify-center gap-1 border-2 p-1 font-mono uppercase ${active ? 'border-accent bg-accent text-accent-foreground' : 'border-muted-foreground bg-background text-foreground hover:border-accent'}`}><span className="text-xl font-black">{item.label.slice(0, 1)}</span><span className="text-[8px] font-black leading-tight">{item.label}</span>{active && <Check aria-hidden="true" className="absolute size-4" />}</button>
}

function CheckRow({ item, active, onToggle, compact = false }: { item: CheckItem; active: boolean; onToggle: (id: string) => void; compact?: boolean }) {
  return <button type="button" onClick={() => onToggle(item.id)} aria-pressed={active} className={`pixel-button flex min-h-11 w-full items-center gap-3 border-2 px-3 py-2 text-left font-mono ${active ? 'border-accent bg-accent text-accent-foreground' : 'border-muted-foreground bg-background text-foreground hover:border-accent'}`}><span className={`flex size-4 shrink-0 items-center justify-center border ${active ? 'border-accent-foreground' : 'border-muted-foreground'}`}>{active && <Check aria-hidden="true" className="size-3" strokeWidth={4} />}</span><span className="min-w-0 flex-1"><span className={`block font-black uppercase ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{item.label}</span>{item.hint && <span className={`mt-1 block text-[8px] font-bold leading-tight ${active ? 'text-accent-foreground/80' : 'text-muted-foreground'}`}>{item.hint}</span>}</span></button>
}

function GroupSection({ number, title, groups, checked, openGroups, onCheck, onGroup }: { number: string; title: string; groups: Group[]; checked: string[]; openGroups: string[]; onCheck: (id: string) => void; onGroup: (id: string) => void }) {
  return <section className="border-b-2 border-muted-foreground px-4 py-5"><SectionTitle number={number} title={title} /><div className="flex flex-col gap-2">{groups.map((group) => { const open = openGroups.includes(group.id); const done = group.checks.filter((check) => checked.includes(check.id)).length; return <article key={group.id} className="border-2 border-muted-foreground bg-background"><button type="button" onClick={() => onGroup(group.id)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left font-mono hover:bg-secondary"><ChevronDown aria-hidden="true" className={`size-4 shrink-0 text-accent transition-transform ${open ? 'rotate-180' : ''}`} /><span className="min-w-0 flex-1"><span className="block text-[11px] font-black uppercase text-foreground">{group.title}</span><span className="block text-[8px] font-bold uppercase text-muted-foreground">{group.subtitle}</span></span><span className={`border px-2 py-1 text-[9px] font-black ${done === group.checks.length ? 'border-accent bg-accent text-accent-foreground' : 'border-muted-foreground text-muted-foreground'}`}>{done}/{group.checks.length}</span></button>{open && <div className="grid grid-cols-1 gap-2 border-t-2 border-muted-foreground p-2 sm:grid-cols-2">{group.checks.map((item) => <CheckRow key={item.id} item={item} active={checked.includes(item.id)} onToggle={onCheck} />)}</div>}</article> })}</div></section>
}
