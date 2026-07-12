export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center overflow-auto p-4">
      <div
        aria-label="Blank 800 by 600 tracker canvas with an eight-bit frame"
        className="game-canvas"
        role="img"
      >
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
