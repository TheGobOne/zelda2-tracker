import Image from 'next/image'

const towns = [
  { name: 'Rauru', src: '/images/towns/rauru.png' },
  { name: 'Ruto', src: '/images/towns/ruto.png' },
  { name: 'Saria', src: '/images/towns/saria.png' },
  { name: 'Mido', src: '/images/towns/mido.png' },
  { name: 'Nabooru', src: '/images/towns/nabooru.png' },
  { name: 'Darunia', src: '/images/towns/darunia.png' },
  { name: 'New Kasuto', src: '/images/towns/new-kasuto.png' },
  { name: 'Old Kasuto', src: '/images/towns/old-kasuto.png' },
]

export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center overflow-auto p-4">
      <div
        aria-label="Blank 600 by 1200 portrait tracker canvas with an eight-bit frame"
        className="game-canvas"
        role="img"
        style={{ width: 600, height: 1200 }}
      >
        <h1
          className="canvas-title"
          style={{
            position: 'absolute',
            top: 36,
            left: 0,
            zIndex: 10,
            width: '100%',
            margin: 0,
            color: '#f5f5f5',
            fontFamily: 'var(--font-pixel), monospace',
            fontSize: 24,
            lineHeight: 1.5,
            textAlign: 'center',
            textShadow: '4px 4px 0 #233bea',
            transform: 'none',
          }}
        >
          TOWNS
        </h1>
        <div aria-label="Town locations" className="town-grid">
          {towns.map((town) => (
            <div className="town-icon" key={town.name}>
              <Image
                alt={`${town.name} town`}
                height={32}
                src={town.src}
                width={32}
              />
            </div>
          ))}
        </div>
        <Image
          alt="Zelda II wizard"
          className="town-wizard"
          height={24}
          src="/images/z2-wizard.png"
          width={24}
        />
        <div className="frame-rail frame-rail-top" />
        <div className="frame-rail frame-rail-right" />
        <div className="frame-rail frame-rail-bottom" />
        <div className="frame-rail frame-rail-left" />
        <div className="frame-corner frame-corner-top-left" />
        <div className="frame-corner frame-corner-top-right" />
        <div className="frame-corner frame-corner-bottom-right" />
        <div className="frame-corner frame-corner-bottom-left" />
      </div>
    </main>
  )
}
