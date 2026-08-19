import { Component, type ReactNode } from "react"
import * as Sentry from "@sentry/react"
import { Button } from "@/components/ui/button"
import { FeedbackButton } from "@/components/FeedbackButton"

type ErrorBoundaryProps = {
  children: ReactNode
  fallback?: ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error: Error | null
}

/**
 * Catches uncaught render errors and shows a friendly fallback instead of a white screen.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo)
    Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack ?? "" } } })
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 bg-background">
          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground text-center max-w-md">
            An unexpected error occurred. Try refreshing the page or going back.
          </p>
          <Button onClick={this.handleRetry} variant="outline">
            Try again
          </Button>
          {/*
            The crash screen is where a feedback button matters most and where
            it was missing: this fallback replaces the WHOLE app, so a user who
            lands here cannot reach Settings, which is where the only "report a
            problem" entry point used to live. They could refresh into the same
            crash forever with no way to say so.

            The error message rides along in the report because a user cannot be
            asked to reconstruct it — and with Sentry currently un-wired in
            production, this email is the only channel that carries it at all.
          */}
          <div className="mt-2">
            <FeedbackButton
              kind="crash"
              label="Tell us what happened"
              showAddress
              extra={{ Error: this.state.error?.message?.slice(0, 300) }}
            />
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
