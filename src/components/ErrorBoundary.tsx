import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Globe app error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0a0a1a',
          color: '#8b8fad',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '20px',
        }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#e0e0e0', marginBottom: '8px' }}>
            Safran PNT
          </div>
          <p>Events currently unavailable. Please try again later.</p>
        </div>
      );
    }

    return this.props.children;
  }
}
