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
            top: 40,
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
          }}
        >
          TOWNS
        </h1>
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
