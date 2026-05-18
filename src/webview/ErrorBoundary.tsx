import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string | null
}

// Catches any render error in the descendant React tree and displays the
// actual error message + component stack on screen. Without this, a render
// crash unmounts to a blank white screen with no diagnostic — the playtest
// logs only show server-side messages, not browser console errors.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, componentStack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught render error:', error, info)
    this.setState({ componentStack: info.componentStack ?? null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen p-6 bg-gray-950 text-gray-100 font-mono text-xs overflow-auto">
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="text-red-400 text-base font-bold">
              💥 ModCommand crashed on render
            </div>
            <div className="bg-gray-900 border border-red-700/50 rounded p-3 whitespace-pre-wrap">
              <div className="text-red-300 font-bold mb-2">
                {this.state.error?.name}: {this.state.error?.message}
              </div>
              {this.state.error?.stack && (
                <div className="text-gray-400 text-[11px] whitespace-pre-wrap break-all">
                  {this.state.error.stack}
                </div>
              )}
            </div>
            {this.state.componentStack && (
              <div className="bg-gray-900 border border-gray-700 rounded p-3">
                <div className="text-gray-400 font-bold mb-2">Component stack:</div>
                <div className="text-gray-500 text-[11px] whitespace-pre-wrap break-all">
                  {this.state.componentStack}
                </div>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="bg-orange-600 hover:bg-orange-500 text-white text-xs px-4 py-2 rounded font-sans"
            >
              Reload dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
