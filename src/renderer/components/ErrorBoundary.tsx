import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'

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
        <div className="flex items-center justify-center h-screen bg-zinc-900 p-8">
          <div className="max-w-lg text-center">
            <div className="text-red-400 text-sm font-mono whitespace-pre-wrap text-left bg-zinc-800 p-4 rounded-lg border border-red-500/30 overflow-auto max-h-[60vh]">
              {this.state.error?.toString()}
              {'\n\n'}
              {this.state.error?.stack}
            </div>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 px-4 py-2 bg-zinc-700 text-zinc-200 rounded-md text-sm hover:bg-zinc-600"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
