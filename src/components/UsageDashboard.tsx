import React, { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { 
  ArrowLeft, 
  TrendingUp, 
  Calendar, 
  Filter,
  Loader2,
  DollarSign,
  Activity,
  FileText,
  RefreshCw
} from 'lucide-react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/chart"
import { UsageStats, ModelUsageStats, ProjectUsageStats, DateUsageStats } from '@/types/electron'

interface UsageDashboardProps {
  onBack: () => void
}

// Cache model mappings outside of component to avoid recreation on each render
const MODEL_DISPLAY_MAP: Record<string, string> = {
  'claude-4-opus': 'Opus 4',
  'claude-4-sonnet': 'Sonnet 4',
  'claude-3.5-sonnet': 'Sonnet 3.5',
  'claude-3-opus': 'Opus 3',
}

// Chart configuration for usage timeline
const chartConfig = {
  cost: {
    label: "Daily Cost",
    color: "hsl(var(--chart-1))",
  },
  tokens: {
    label: "Tokens Used",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

export const UsageDashboard = React.memo<UsageDashboardProps>(({ onBack }) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<UsageStats | null>(null)
  const [selectedDateRange, setSelectedDateRange] = useState<'all' | '7d' | '30d'>('all')
  const [activeTab, setActiveTab] = useState('overview')

  const loadUsageStats = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      
      let result
      if (selectedDateRange === 'all') {
        result = await window.electronAPI.usage.getStats()
      } else {
        const endDate = new Date()
        endDate.setHours(23, 59, 59, 999) // End of today
        const startDate = new Date()
        const days = selectedDateRange === '7d' ? 7 : 30
        startDate.setDate(startDate.getDate() - days + 1) // Include current day in range
        startDate.setHours(0, 0, 0, 0) // Start of the day
        
        result = await window.electronAPI.usage.getByDateRange(
          startDate.toISOString(),
          endDate.toISOString()
        )
      }
      
      if (result.success && result.data) {
        setStats(result.data)
      } else {
        throw new Error(result.error || 'Failed to load usage statistics')
      }
    } catch (err) {
      console.error('Failed to load usage stats:', err)
      setError('Failed to load usage statistics. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [selectedDateRange])

  const clearCacheAndReload = useCallback(async () => {
    try {
      await window.electronAPI.usage.clearCache()
      await loadUsageStats()
    } catch (err) {
      console.error('Failed to clear cache:', err)
      setError('Failed to clear cache. Please try again.')
    }
  }, [loadUsageStats])

  useEffect(() => {
    loadUsageStats()
  }, [selectedDateRange]) // Only depend on selectedDateRange, not the entire callback

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(amount)
  }

  const formatNumber = (num: number): string => {
    return new Intl.NumberFormat('en-US').format(num)
  }

  const formatTokens = (num: number): string => {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`
    }
    return formatNumber(num)
  }

  const getModelDisplayName = (model: string): string => {
    return MODEL_DISPLAY_MAP[model] || model
  }

  const getModelColor = (model: string): string => {
    if (model.includes('opus')) return 'text-primary'
    if (model.includes('sonnet')) return 'text-primary'
    return 'text-muted-foreground'
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="border-b border-border bg-background"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-accent rounded-md transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Usage Dashboard</h1>
              <p className="text-xs text-muted-foreground">
                Track your Claude Code usage and costs
              </p>
            </div>
          </div>
          
          {/* Date Range Filter and Actions */}
          <div className="flex items-center space-x-4">
            {/* Cache refresh button */}
            <button
              onClick={clearCacheAndReload}
              disabled={loading}
              className="p-2 hover:bg-accent rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Clear cache and reload data"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <div className="flex space-x-1">
                {([
                  { key: 'all', label: 'All Time', short: 'All' },
                  { key: '30d', label: 'Last 30 Days', short: '30d' },
                  { key: '7d', label: 'Last 7 Days', short: '7d' }
                ] as const).map((range) => (
                <button
                  key={range.key}
                  onClick={() => setSelectedDateRange(range.key)}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    selectedDateRange === range.key
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  <span className="hidden sm:inline">{range.label}</span>
                  <span className="sm:hidden">{range.short}</span>
                </button>
              ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-6xl mx-auto space-y-6"
          >
            {/* Loading skeleton for summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-4 relative overflow-hidden">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="h-3 bg-muted rounded animate-pulse w-16"></div>
                      <div className="h-6 bg-muted rounded animate-pulse w-20"></div>
                    </div>
                    <div className="h-8 w-8 bg-muted rounded animate-pulse"></div>
                  </div>
                  {/* Shimmer effect for loading */}
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/5 to-transparent animate-pulse" />
                </div>
              ))}
            </div>

            {/* Loading skeleton for main content */}
            <div className="bg-card border border-border rounded-lg">
              <div className="border-b border-border">
                <div className="flex space-x-4 p-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-4 bg-muted rounded animate-pulse w-16"></div>
                  ))}
                </div>
              </div>
              <div className="p-6 space-y-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-4 bg-muted rounded animate-pulse w-full"></div>
                ))}
              </div>
            </div>

            {/* Loading indicator */}
            <div className="text-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Loading usage statistics... This may take a moment for large datasets.
              </p>
            </div>
          </motion.div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <p className="text-sm text-destructive mb-4">{error}</p>
              <button
                onClick={loadUsageStats}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        ) : stats ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="max-w-6xl mx-auto space-y-6"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Total Cost Card */}
              <div className="bg-card border border-border rounded-lg p-4 hover:shadow-lg hover:shadow-green-500/20 hover:border-green-500/30 transition-all duration-300 hover:bg-card/80 relative overflow-hidden group cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Cost</p>
                    <p className="text-2xl font-bold mt-1 text-foreground group-hover:text-green-600 transition-colors duration-300">
                      {formatCurrency(stats.total_cost)}
                    </p>
                  </div>
                  <div className="relative p-2 rounded-full bg-green-500/15 group-hover:bg-green-500/25 transition-all duration-300">
                    <DollarSign className="h-6 w-6 text-green-500/80 group-hover:text-green-500 transition-all duration-500 group-hover:rotate-12 group-hover:scale-110" />
                  </div>
                </div>
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/15 to-transparent group-hover:translate-x-full transition-transform duration-700" />
              </div>

              {/* Total Sessions Card */}
              <div className="bg-card border border-border rounded-lg p-4 hover:shadow-lg hover:shadow-blue-500/20 hover:border-blue-500/30 transition-all duration-300 hover:bg-card/80 relative overflow-hidden group cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Sessions</p>
                    <p className="text-2xl font-bold mt-1 text-foreground group-hover:text-blue-600 transition-colors duration-300">
                      {formatNumber(stats.total_sessions)}
                    </p>
                  </div>
                  <div className="relative p-2 rounded-full bg-blue-500/15 group-hover:bg-blue-500/25 transition-all duration-300">
                    <FileText className="h-6 w-6 text-blue-500/80 group-hover:text-blue-500 transition-all duration-500 group-hover:scale-110" />
                  </div>
                </div>
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/15 to-transparent group-hover:translate-x-full transition-transform duration-700" />
              </div>

              {/* Total Tokens Card */}
              <div className="bg-card border border-border rounded-lg p-4 hover:shadow-lg hover:shadow-purple-500/20 hover:border-purple-500/30 transition-all duration-300 hover:bg-card/80 relative overflow-hidden group cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Tokens</p>
                    <p className="text-2xl font-bold mt-1 text-foreground group-hover:text-purple-600 transition-colors duration-300">
                      {formatTokens(stats.total_tokens)}
                    </p>
                  </div>
                  <div className="relative p-2 rounded-full bg-purple-500/15 group-hover:bg-purple-500/25 transition-all duration-300">
                    <Activity className="h-6 w-6 text-purple-500/80 group-hover:text-purple-500 transition-all duration-500 group-hover:animate-pulse" />
                  </div>
                </div>
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/15 to-transparent group-hover:translate-x-full transition-transform duration-700" />
              </div>

              {/* Average Cost per Session Card */}
              <div className="bg-card border border-border rounded-lg p-4 hover:shadow-lg hover:shadow-orange-500/20 hover:border-orange-500/30 transition-all duration-300 hover:bg-card/80 relative overflow-hidden group cursor-pointer">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Avg Cost/Session</p>
                    <p className="text-2xl font-bold mt-1 text-foreground group-hover:text-orange-600 transition-colors duration-300">
                      {formatCurrency(
                        stats.total_sessions > 0 
                          ? stats.total_cost / stats.total_sessions 
                          : 0
                      )}
                    </p>
                  </div>
                  <div className="relative p-2 rounded-full bg-orange-500/15 group-hover:bg-orange-500/25 transition-all duration-300">
                    <TrendingUp className="h-6 w-6 text-orange-500/80 group-hover:text-orange-500 transition-all duration-500 group-hover:-rotate-12 group-hover:scale-110" />
                  </div>
                </div>
                {/* Shimmer effect */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-foreground/15 to-transparent group-hover:translate-x-full transition-transform duration-700" />
              </div>
            </div>

            {/* Tabs for different views */}
            <div className="bg-card border border-border rounded-lg">
              <div className="border-b border-border">
                <div className="flex">
                  {[
                    { id: 'overview', label: 'Overview' },
                    { id: 'models', label: 'By Model' },
                    { id: 'projects', label: 'By Project' },
                    { id: 'timeline', label: 'Timeline' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-6">
                {/* Overview Tab */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    <div className="bg-secondary rounded-lg p-4">
                      <h3 className="text-sm font-semibold mb-4 text-foreground">Token Breakdown</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Input Tokens</p>
                          <p className="text-lg font-semibold text-foreground">{formatTokens(stats.total_input_tokens)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Output Tokens</p>
                          <p className="text-lg font-semibold text-foreground">{formatTokens(stats.total_output_tokens)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cache Write</p>
                          <p className="text-lg font-semibold text-foreground">{formatTokens(stats.total_cache_creation_tokens)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Cache Read</p>
                          <p className="text-lg font-semibold text-foreground">{formatTokens(stats.total_cache_read_tokens)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-secondary rounded-lg p-4">
                        <h3 className="text-sm font-semibold mb-4 text-foreground">Most Used Models</h3>
                        <div className="space-y-3">
                          {stats.by_model.slice(0, 3).map((model: ModelUsageStats) => (
                            <div key={model.model} className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <span className={`px-2 py-1 text-xs rounded-md border border-border ${getModelColor(model.model)} bg-background`}>
                                  {getModelDisplayName(model.model)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {model.session_count} sessions
                                </span>
                              </div>
                              <span className="text-sm font-medium text-foreground">
                                {formatCurrency(model.total_cost)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="bg-secondary rounded-lg p-4">
                        <h3 className="text-sm font-semibold mb-4 text-foreground">Top Projects</h3>
                        <div className="space-y-3">
                          {stats.by_project.slice(0, 3).map((project: ProjectUsageStats) => (
                            <div key={project.project_path} className="flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium truncate max-w-[200px] text-foreground" title={project.project_path}>
                                  {project.project_path.split('/').pop() || project.project_path}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {project.session_count} sessions
                                </span>
                              </div>
                              <span className="text-sm font-medium text-foreground">
                                {formatCurrency(project.total_cost)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Models Tab */}
                {activeTab === 'models' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold mb-4 text-foreground">Usage by Model</h3>
                    {stats.by_model.map((model: ModelUsageStats) => (
                      <div key={model.model} className="space-y-2 p-4 bg-secondary rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <span className={`px-2 py-1 text-xs rounded-md border border-border ${getModelColor(model.model)} bg-background`}>
                              {getModelDisplayName(model.model)}
                            </span>
                            <span className="text-sm text-muted-foreground">
                              {model.session_count} sessions
                            </span>
                          </div>
                          <span className="text-sm font-semibold text-foreground">
                            {formatCurrency(model.total_cost)}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Input: </span>
                            <span className="font-medium text-foreground">{formatTokens(model.input_tokens)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Output: </span>
                            <span className="font-medium text-foreground">{formatTokens(model.output_tokens)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cache W: </span>
                            <span className="font-medium text-foreground">{formatTokens(model.cache_creation_tokens)}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Cache R: </span>
                            <span className="font-medium text-foreground">{formatTokens(model.cache_read_tokens)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Projects Tab */}
                {activeTab === 'projects' && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold mb-4 text-foreground">Usage by Project</h3>
                    {stats.by_project.map((project: ProjectUsageStats) => (
                      <div key={project.project_path} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                        <div className="flex flex-col truncate">
                          <span className="text-sm font-medium truncate text-foreground" title={project.project_path}>
                            {project.project_path}
                          </span>
                          <div className="flex items-center space-x-3 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {project.session_count} sessions
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTokens(project.total_tokens)} tokens
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-foreground">{formatCurrency(project.total_cost)}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(project.total_cost / project.session_count)}/session
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Timeline Tab */}
                {activeTab === 'timeline' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold mb-6 flex items-center space-x-2">
                      <Calendar className="h-4 w-4" />
                      <span>Daily Usage</span>
                    </h3>
                    {stats.by_date.length > 0 ? (() => {
                      // Transform data for Recharts
                      const chartData = stats.by_date.map((day: DateUsageStats) => {
                        const date = new Date(day.date.replace(/-/g, '/'))
                        return {
                          date: day.date,
                          displayDate: date.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric' 
                          }),
                          cost: day.total_cost,
                          tokens: day.total_tokens,
                          formattedCost: formatCurrency(day.total_cost),
                          formattedTokens: formatTokens(day.total_tokens),
                          modelsUsed: day.models_used.length,
                          fullDate: date.toLocaleDateString('en-US', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })
                        }
                      })

                      return (
                        <div className="w-full">
                          <ChartContainer config={chartConfig} className="h-[300px] w-full">
                            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/20" />
                              <XAxis 
                                dataKey="displayDate"
                                tickLine={false}
                                axisLine={false}
                                className="text-xs"
                                angle={-45}
                                textAnchor="end"
                                height={60}
                                interval={0}
                              />
                              <YAxis 
                                tickLine={false}
                                axisLine={false}
                                className="text-xs"
                                tickFormatter={formatCurrency}
                              />
                              <ChartTooltip
                                content={({ active, payload }) => {
                                  if (!active || !payload?.length) return null
                                  
                                  const data = payload[0]?.payload
                                  if (!data) return null
                                  
                                  return (
                                    <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                                      <p className="text-sm font-semibold text-popover-foreground mb-2">
                                        {data.fullDate}
                                      </p>
                                      <div className="space-y-1">
                                        <div className="flex items-center justify-between gap-4">
                                          <span className="text-xs text-muted-foreground">Cost:</span>
                                          <span className="text-sm font-medium">{data.formattedCost}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                          <span className="text-xs text-muted-foreground">Tokens:</span>
                                          <span className="text-sm font-medium">{data.formattedTokens}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4">
                                          <span className="text-xs text-muted-foreground">Models:</span>
                                          <span className="text-sm font-medium">
                                            {data.modelsUsed} model{data.modelsUsed !== 1 ? 's' : ''}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )
                                }}
                              />
                              <Bar 
                                dataKey="cost" 
                                fill="var(--color-cost)"
                                radius={[4, 4, 0, 0]}
                                className="hover:opacity-80 transition-opacity"
                              />
                            </BarChart>
                          </ChartContainer>
                          
                          <div className="mt-4 text-center text-xs text-muted-foreground">
                            Daily Usage Over Time
                          </div>
                        </div>
                      )
                    })() : (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        No usage data available for the selected period
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        ) : null}
      </div>
    </div>
  )
})