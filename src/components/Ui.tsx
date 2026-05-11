'use client'

import { useEffect, useState } from 'react'
import type { PropsWithChildren, ReactNode } from 'react'
import { useI18n } from '../lib/i18n'

export function PageTitle({ children }: PropsWithChildren) {
  const { t } = useI18n()
  const content = translateChildren(children, t)
  return <h1 className="text-2xl font-semibold tracking-tight text-slate-50">{content}</h1>
}

export function Card({ children }: PropsWithChildren) {
  return (
    <div className="rounded-2xl border border-[#233a61] bg-gradient-to-br from-[#12233d] via-[#0f1f36] to-[#0b172a] p-5 shadow-lg shadow-black/30">
      {children}
    </div>
  )
}

export function Label({ children }: PropsWithChildren) {
  const { t } = useI18n()
  const content = translateChildren(children, t)
  return <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">{content}</div>
}

export function Button({
  children,
  onClick,
  type = 'button',
  disabled,
  size = 'md',
}: PropsWithChildren<{ onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; size?: 'sm' | 'md' }>) {
  const { t } = useI18n()
  const content = translateChildren(children, t)
  const sizeClasses = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[
        'rounded-lg bg-gradient-to-r from-[#3a8cff] to-[#256ad6] font-semibold text-white shadow-md shadow-black/30 transition duration-200 ease-out hover:from-[#4aa1ff] hover:to-[#2f7ae6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6eb6ff] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1f36] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses,
      ].join(' ')}
    >
      {content}
    </button>
  )
}

export function DangerButton({
  children,
  onClick,
  type = 'button',
  disabled,
  size = 'md',
}: PropsWithChildren<{ onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; size?: 'sm' | 'md' }>) {
  const { t } = useI18n()
  const content = translateChildren(children, t)
  const sizeClasses = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm'
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={[
        'rounded-lg bg-gradient-to-r from-rose-600 to-rose-700 font-semibold text-white shadow-md shadow-black/30 transition duration-200 ease-out hover:from-rose-500 hover:to-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1f36] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses,
      ].join(' ')}
    >
      {content}
    </button>
  )
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { t } = useI18n()
  return (
    <input
      {...props}
      placeholder={props.placeholder ? t(props.placeholder) : props.placeholder}
      className={[
        'w-full rounded-lg border border-[#29446c] bg-[#0b1729] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-inner shadow-black/30',
        'focus:border-[#5fb3ff] focus:outline-none focus:ring-2 focus:ring-[#5fb3ff]/30',
        props.className ?? '',
      ].join(' ')}
    />
  )
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { t } = useI18n()
  return (
    <textarea
      {...props}
      placeholder={props.placeholder ? t(props.placeholder) : props.placeholder}
      className={[
        'w-full rounded-lg border border-[#29446c] bg-[#0b1729] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-inner shadow-black/30',
        'focus:border-[#5fb3ff] focus:outline-none focus:ring-2 focus:ring-[#5fb3ff]/30',
        props.className ?? '',
      ].join(' ')}
    />
  )
}

export function ErrorBox({ title, detail }: { title: string; detail?: string }) {
  const { t } = useI18n()
  return (
    <div className="rounded-lg border border-rose-800/60 bg-rose-950/70 p-4 text-sm text-rose-100 shadow shadow-black/30">
      <div className="font-medium">{t(title)}</div>
      {detail ? <pre className="mt-2 whitespace-pre-wrap break-words text-xs text-rose-200">{detail}</pre> : null}
    </div>
  )
}

export function InfoBox({ title, detail }: { title: string; detail?: string }) {
  const { t } = useI18n()
  return (
    <div className="rounded-lg border border-[#29446c] bg-[#0f1f36] p-4 text-sm text-slate-100 shadow shadow-black/30">
      <div className="font-medium">{t(title)}</div>
      {detail ? <div className="mt-2 whitespace-pre-wrap text-xs text-slate-300">{t(detail)}</div> : null}
    </div>
  )
}

export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const { t } = useI18n()

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <span className="relative inline-flex items-center group">
        <button
          type="button"
          aria-label={t('Help')}
          onClick={() => setOpen(true)}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#2b4a75] bg-[#1b2f4a] text-[11px] font-semibold text-slate-100 shadow-sm shadow-black/30 transition hover:bg-[#26436b]"
        >
          ?
        </button>
        <span className="pointer-events-none absolute left-7 top-1/2 z-50 hidden min-w-[12rem] max-w-xs -translate-y-1/2 whitespace-pre-line rounded-md border border-[#274266] bg-[#0f1f36] px-3 py-2 text-xs text-slate-100 shadow-lg group-hover:block">
          {t(text)}
        </span>
      </span>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div className="mt-24 w-full max-w-lg rounded-2xl border border-[#29446c] bg-[#0f1f36] p-5 shadow-2xl shadow-black/50">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-slate-50">{t('Help')}</div>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-sm text-slate-200 hover:bg-white/10"
                onClick={() => setOpen(false)}
              >
                {t('Close')}
              </button>
            </div>
            <div className="mt-3 whitespace-pre-line text-sm text-slate-100">{t(text)}</div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function translateChildren(children: ReactNode, t: (key: string) => string): ReactNode {
  if (children === null || children === undefined) return children
  if (Array.isArray(children)) {
    return children.map(child => {
      return (typeof child === 'string' ? t(child) : child);
    });
  }
  return typeof children === 'string' ? t(children) : children
}
