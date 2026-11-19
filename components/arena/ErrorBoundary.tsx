'use client';

import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message);
      if (parsed && typeof parsed.error === 'string') {
        readable = `Cloud sync issue (${parsed.operationType || 'request'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Oracle Arena ErrorBoundary caught:', error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-[#090B10] text-[#ECEEF4] flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-lg bg-[#121622] border border-rose-500/40 p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 border border-rose-400/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-300" />
              </div>
              <div>
                <h1 className="font-display text-xl font-bold text-[#F5EFE0]">
                  Oracle Arena Interrupted
                </h1>
                <p className="text-xs text-[#9CA3B8]">
                  A runtime or cloud persistence error was caught safely.
                </p>
              </div>
            </div>

            <p className="text-sm text-rose-200/90 bg-[#0B0E17] border border-white/10 rounded-md p-3.5 font-mono break-words">
              {this.state.message}
            </p>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#D4AF37] text-[#0B0D13] text-sm font-semibold hover:bg-[#E5C454] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Resume Arena</span>
              </button>
            </div>
          </div>
        </main>
      );
    }

    return this.props.children;
  }
}
