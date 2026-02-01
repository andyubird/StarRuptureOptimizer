import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: 20, color: '#ff5555', background: '#220000', height: '100vh', overflow: 'auto' }}>
                    <h1>Something went wrong.</h1>
                    <h2 style={{ fontFamily: 'monospace' }}>{this.state.error?.toString()}</h2>
                    <details style={{ whiteSpace: 'pre-wrap', marginTop: 10 }}>
                        {this.state.errorInfo?.componentStack}
                        <br />
                        {this.state.error?.stack}
                    </details>
                </div>
            );
        }

        return this.props.children;
    }
}
