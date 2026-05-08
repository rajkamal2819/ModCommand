import type { DiffChunk } from '../../shared/messages'

interface Props {
  chunks: DiffChunk[]
  original: string
  edited: string
}

export default function DiffViewer({ chunks, original, edited }: Props) {
  // If no chunks, fall back to side-by-side raw display
  if (!chunks || chunks.length === 0) {
    return (
      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="bg-red-950/40 border border-red-800/30 rounded p-2 whitespace-pre-wrap text-red-300">
          {original}
        </div>
        <div className="bg-green-950/40 border border-green-800/30 rounded p-2 whitespace-pre-wrap text-green-300">
          {edited}
        </div>
      </div>
    )
  }

  return (
    <div className="text-xs font-mono bg-gray-900 rounded p-3 overflow-auto max-h-64">
      {chunks.map((chunk, i) => (
        <span
          key={i}
          className={
            chunk.added
              ? 'bg-green-900/50 text-green-300'
              : chunk.removed
              ? 'bg-red-900/50 text-red-300 line-through'
              : 'text-gray-400'
          }
        >
          {chunk.value}
        </span>
      ))}
    </div>
  )
}
