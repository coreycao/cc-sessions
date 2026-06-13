import { useMemo, useState } from 'react'
import type { SessionInfo } from '../../shared/types'
import { useI18n } from '../lib/i18n'

interface StatsPanelProps {
  sessions: SessionInfo[]
}

export const StatsPanel = function StatsPanel({ sessions }: StatsPanelProps) {
  const { t, language } = useI18n()
  const [expanded, setExpanded] = useState(true)

  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = now.getFullYear() * 100 + (now.getMonth() + 1)

    let thisMonthCount = 0
    let totalMessages = 0
    let claudeCount = 0
    let codexCount = 0
    const projectCounts: Record<string, number> = {}

    for (const s of sessions) {
      totalMessages += s.messageCount
      if (s.provider === 'codex') codexCount++
      else claudeCount++

      const d = new Date(s.created)
      const ym = d.getFullYear() * 100 + (d.getMonth() + 1)
      if (ym === thisMonth) thisMonthCount++

      const name = basename(s.projectName || 'Unknown')
      projectCounts[name] = (projectCounts[name] || 0) + 1
    }

    // Last 7 days activity
    const dayLabels: string[] = []
    const dayValues: number[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      dayLabels.push(d.toLocaleString(language === 'zh' ? 'zh-CN' : 'en', { weekday: 'short' }).slice(0, 2))
      let count = 0
      for (const s of sessions) {
        const sd = new Date(s.created)
        const sk = `${sd.getFullYear()}-${sd.getMonth()}-${sd.getDate()}`
        if (sk === key) count++
      }
      dayValues.push(count)
    }

    const avgMessages = sessions.length > 0 ? Math.round(totalMessages / sessions.length) : 0
    const topProject = Object.entries(projectCounts).sort((a, b) => b[1] - a[1])[0]

    return {
      total: sessions.length,
      thisMonthCount,
      avgMessages,
      claudeCount,
      codexCount,
      topProject,
      dayLabels,
      dayValues,
    }
  }, [language, sessions])

  const maxDayVal = Math.max(...stats.dayValues, 1)

  if (sessions.length === 0) return null

  return (
    <div className="border-t border-edge/30">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-content-4 hover:text-content-3 transition-colors"
      >
        <span>{t('stats.title')}</span>
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div
        className={`grid overflow-hidden transition-[grid-template-rows] duration-300 ease-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        aria-hidden={!expanded}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`px-3 pb-3 space-y-3 transition-all duration-300 ease-out ${expanded ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0 pointer-events-none'}`}>
            {/* Key metrics grid */}
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label={t('stats.total')} value={stats.total} accent />
              <MetricCard label={t('stats.thisMonth')} value={stats.thisMonthCount} accent={stats.thisMonthCount > 0} />
              <MetricCard label={t('stats.avgLength')} value={`${stats.avgMessages}`} sub={t('stats.messages')} />
              <MetricCard
                label={t('stats.topProject')}
                value={stats.topProject ? abbreviate(stats.topProject[0], 12) : '—'}
                sub={stats.topProject ? t('stats.sessions', { count: stats.topProject[1] }) : undefined}
              />
              <MetricCard label={t('stats.claudeCode')} value={stats.claudeCount} />
              <MetricCard label={t('stats.codexCli')} value={stats.codexCount} accent={stats.codexCount > 0} />
            </div>

            {/* Activity - last 7 days */}
            <div>
              <div className="text-[10px] text-content-4 mb-1.5">{t('stats.thisWeek')}</div>
              <div className="flex items-end gap-[3px] h-8">
                {stats.dayValues.map((v, i) => {
                  const pct = Math.max((v / maxDayVal) * 100, 4)
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <div
                        className="w-full rounded-sm transition-all duration-300"
                        style={{
                          height: `${pct}%`,
                          minHeight: 3,
                          background: i === stats.dayValues.length - 1
                            ? 'var(--color-accent)'
                            : 'var(--color-content-4)',
                          opacity: v > 0 ? 1 : 0.3,
                        }}
                      />
                      <span className="text-[8px] text-content-5 leading-none">
                        {stats.dayLabels[i]}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub, accent }: {
  label: string
  value: string | number
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-surface-2/60 px-2.5 py-2">
      {/* Decorative accent dot */}
      {accent && (
        <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-accent/60" />
      )}
      <div className="text-[10px] text-content-4 leading-none mb-1">{label}</div>
      <div className="text-sm font-semibold text-content tabular-nums leading-none">{value}</div>
      {sub && <div className="text-[9px] text-content-5 mt-0.5 leading-none">{sub}</div>}
    </div>
  )
}

function abbreviate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…'
}

function basename(path: string): string {
  const seg = path.replace(/\/+$/, '').split('/')
  return seg[seg.length - 1] || path
}
