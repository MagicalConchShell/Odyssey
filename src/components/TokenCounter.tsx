import React from 'react'
import { Hash, TrendingUp } from 'lucide-react'
import clsx from 'clsx'

interface TokenCounterProps {
  tokens: number
  className?: string
  showTrend?: boolean
  previousTokens?: number
}

export const TokenCounter: React.FC<TokenCounterProps> = ({
  tokens,
  className,
  showTrend = false,
  previousTokens = 0
}) => {
  const formatTokens = (count: number) => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`
    }
    if (count >= 10000) {
      return `${Math.round(count / 1000)}K`
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`
    }
    return count.toLocaleString()
  }

  const getTokenColor = (count: number) => {
    if (count < 1000) return 'text-green-600 dark:text-green-400'
    if (count < 10000) return 'text-yellow-600 dark:text-yellow-400'
    if (count < 50000) return 'text-orange-600 dark:text-orange-400'
    return 'text-red-600 dark:text-red-400'
  }

  const trend = showTrend && previousTokens > 0 ? tokens - previousTokens : 0

  return (
    <div className={clsx(
      "flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg shadow-sm",
      className
    )}>
      <Hash className="h-4 w-4 text-muted-foreground" />
      <span className={clsx("text-sm font-bold tabular-nums", getTokenColor(tokens))}>
        {formatTokens(tokens)}
      </span>
      {showTrend && trend !== 0 && (
        <div className="flex items-center gap-1">
          <TrendingUp className={clsx(
            "h-3 w-3",
            trend > 0 ? "text-red-500" : "text-green-500"
          )} />
          <span className={clsx(
            "text-xs font-medium tabular-nums",
            trend > 0 ? "text-red-500" : "text-green-500"
          )}>
            {trend > 0 ? '+' : ''}{formatTokens(Math.abs(trend))}
          </span>
        </div>
      )}
      <span className="text-xs text-muted-foreground">tokens</span>
    </div>
  )
}