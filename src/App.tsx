import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_APP_SLUG, PROJECT_TITLE } from './config.ts';

interface Session {
  userId: string;
  sessionId: string;
  agentId: string;
}

const iframeSandbox = [
  'allow-scripts',
  'allow-forms',
  'allow-popups',
  'allow-downloads',
  'allow-same-origin',
];
const iframeSandboxAttr = iframeSandbox.join(' ');

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [iframeSrc, setIframeSrc] = useState<string>('');
  const [sessionToken, setSessionToken] = useState<string>('');
  const [appName, setAppName] = useState(DEFAULT_APP_SLUG);

  useEffect(() => {
    const initialise = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const requestedApp = urlParams.get('app')?.trim() || DEFAULT_APP_SLUG;
        setAppName(requestedApp);

        const requiredParams = ['userId', 'sessionId', 'agentId', 'time', 'nonce', 'signature', 'origin'];
        const missing = requiredParams.filter((key) => !urlParams.has(key));

        const applySession = (data: any) => {
          if (!data?.session) {
            throw new Error('Session payload missing'); 
          }
          setSession(data.session);
          const tokenValue = typeof data.token === 'string' ? data.token.trim() : '';
          if (!tokenValue) {
            throw new Error('Session token missing');
          }
          setSessionToken(tokenValue);
          setError(null);
        };

        if (missing.length > 0) {
          try {
            const fallbackResponse = await fetch('/api/session');
            const fallbackData = await fallbackResponse.json();
            if (!fallbackResponse.ok || !fallbackData.success) {
              throw new Error(
                fallbackData.error || `Missing session parameters: ${missing.join(', ')}`
              );
            }
            applySession(fallbackData);
            return;
          } catch (fallbackError) {
            console.warn('Falling back to local development session', fallbackError);
            applySession({
              session: {
                userId: 'dev-user',
                sessionId: 'dev-session',
                agentId: 'dev-agent',
              },
              token: 'dev-token',
            });
            return;
          }
        }

        const response = await fetch(`/api/session?${urlParams.toString()}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Session verification failed');
        }
        applySession(data);
      } catch (err) {
        setError((err as Error).message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    initialise();
  }, []);

  useEffect(() => {
    if (!session || loading || !sessionToken) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const iframeParams = new URLSearchParams(urlParams);
    iframeParams.delete('app');

    iframeParams.set('sessionId', session.sessionId);
    iframeParams.set('userId', session.userId);
    iframeParams.set('agentId', session.agentId);
    iframeParams.set('parentOrigin', window.location.origin);
    iframeParams.set('sessionToken', sessionToken);

    setIframeSrc(`/apps/${appName}/index.html?${iframeParams.toString()}`);
  }, [appName, loading, session, sessionToken]);

  const iframeTitle = useMemo(() => {
    if (!session) return `${PROJECT_TITLE} (${appName})`;
    return `${PROJECT_TITLE} (${appName}) - ${session.sessionId.slice(0, 8)}`;
  }, [appName, session]);

  if (loading) {
    return (
      <iframe
        className="product-frame"
        src="about:blank"
        title="Loading..."
        sandbox={iframeSandboxAttr}
      />
    );
  }

  if (error || !session || !sessionToken || !iframeSrc) {
    return (
      <div className="error">
        <h2>Session unavailable</h2>
        <p>{error ?? 'Unable to initialise session.'}</p>
      </div>
    );
  }

  return (
    <iframe
      className="product-frame"
      src={iframeSrc}
      title={iframeTitle}
      allow="clipboard-write; encrypted-media; microphone"
      sandbox={iframeSandboxAttr}
    />
  );
}

export default App;
