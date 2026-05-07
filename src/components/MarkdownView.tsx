'use client'

import type { ReactNode } from 'react'

type MarkdownViewProps = {
  content: string
}

function renderMarkdownBlocks(content: string): ReactNode[] {
  const lines = content.split(/\r?\n/)
  const blocks: ReactNode[] = []
  let listItems: string[] = []

  const flushList = (keyPrefix: string) => {
    if (!listItems.length) return
    const items = listItems.map((item, index) => (
      <li key={`${keyPrefix}-item-${index}`} className="leading-relaxed text-slate-200">
        {item}
      </li>
    ))
    blocks.push(
      <ul key={`${keyPrefix}-list-${blocks.length}`} className="list-disc space-y-1 pl-5 text-sm">
        {items}
      </ul>,
    )
    listItems = []
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) {
      flushList(`blank-${index}`)
      return
    }
    if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2))
      return
    }
    flushList(`line-${index}`)
    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h4 key={`h4-${index}`} className="text-base font-semibold text-slate-100">
          {trimmed.slice(4)}
        </h4>,
      )
      return
    }
    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h3 key={`h3-${index}`} className="text-lg font-semibold text-slate-100">
          {trimmed.slice(3)}
        </h3>,
      )
      return
    }
    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h2 key={`h2-${index}`} className="text-xl font-semibold text-slate-100">
          {trimmed.slice(2)}
        </h2>,
      )
      return
    }
    blocks.push(
      <p key={`p-${index}`} className="text-sm leading-relaxed text-slate-200">
        {trimmed}
      </p>,
    )
  })

  flushList('final')
  return blocks
}

export function MarkdownView({ content }: MarkdownViewProps) {
  return <div className="space-y-3">{renderMarkdownBlocks(content)}</div>
}
