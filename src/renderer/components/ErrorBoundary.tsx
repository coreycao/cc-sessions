import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './ui'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center bg-surface-2 p-8">
          <div className="w-full max-w-xl overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl">
            <div className="flex items-center gap-3 border-b border-edge px-4 py-3">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-500">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <div>
                <div className="text-[14px] font-semibold text-content">Something went wrong</div>
                <div className="text-[11px] text-content-4">The app caught a rendering error. Your local data was not changed.</div>
              </div>
            </div>
            <div className="max-h-[58vh] overflow-auto border-b border-edge bg-surface-2/45 p-4 font-mono text-[11px] leading-relaxed text-content-3">
              <div className="whitespace-pre-wrap break-words">
                {this.state.error?.toString()}
                {'\n\n'}
                {this.state.error?.stack}
              </div>
            </div>
            <div className="flex justify-end px-4 py-3">
              <Button
              onClick={() => this.setState({ hasError: false, error: null })}
              variant="primary"
            >
              Try again
              </Button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

interface InlineErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

interface InlineErrorBoundaryState {
  hasError: boolean
}

export class InlineErrorBoundary extends Component<InlineErrorBoundaryProps, InlineErrorBoundaryState> {
  state: InlineErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): InlineErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('InlineErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) return this.props.fallback
    return this.props.children
  }

  reset() {
    this.setState({ hasError: false })
  }
}
