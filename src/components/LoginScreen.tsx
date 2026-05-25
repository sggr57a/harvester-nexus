import { useState } from 'react';

interface LoginScreenProps {
  onLogin: (username: string, password: string) => boolean;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Simulate login delay for demo
    setTimeout(() => {
      const loginAccepted = onLogin(username, password);
      if (!loginAccepted) {
        setError('Use the demo credentials: admin / demo');
      }
      setIsLoading(false);
    }, 1000);
  };

  return (
    <div className="login-screen">
      <div className="login-container">
        <div className="login-header">
          <div className="elevate-wordmark" aria-label="Harvester">
            {'HARVESTER'.split('').map((letter, index) => (
              <span key={`${letter}-${index}`}>{letter}</span>
            ))}
          </div>
          <div className="elevate-subwordmark" aria-label="Nexus">
            {'NEXUS'.split('').map((letter, index) => (
              <span key={`${letter}-${index}`}>{letter}</span>
            ))}
          </div>
          <div className="elevate-underlight" />
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group elevate-field">
            <input
              id="username"
              type="text"
              autoComplete="username"
              aria-label="Username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError('');
              }}
              required
            />
          </div>

          <div className="form-group elevate-field">
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-label="Password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
              required
            />
          </div>

          {error && <div className="login-error" role="alert">{error}</div>}

          {isLoading && (
            <div className="login-loading" aria-live="polite">
              <div className="spinner-small" aria-hidden="true" />
              <span>Elevating&hellip;</span>
            </div>
          )}

          {/* No visible submit button — pressing Enter inside the form still submits.
              `type="submit"` with `hidden` is required so the form has an implicit
              submitter for keyboard activation. */}
          <button type="submit" className="login-submit-hidden" tabIndex={-1} aria-hidden="true" />
        </form>
      </div>
    </div>
  );
}