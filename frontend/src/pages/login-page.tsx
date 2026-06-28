import { useState, type FormEvent } from 'react';
import { Link, useNavigate, Navigate } from 'react-router';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function LoginPage() {
  const { login, user, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/agents" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/agents');
    } catch {
      // error is set in store
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-soft p-4">
      <div className="w-full max-w-sm">
        <h1 className="font-heading text-3xl text-center text-ink mb-8">Agent Studio</h1>
        <div className="bg-white rounded-2xl shadow-card p-8">
          <h2 className="font-heading text-xl text-ink mb-6">Sign in</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); clearError(); }}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); clearError(); }}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-error">{error}</p>
            )}
            <Button type="submit" className="w-full bg-primary hover:bg-primary-dark text-white" disabled={submitting}>
              {submitting ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
          <p className="text-sm text-ink-muted text-center mt-6">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-primary hover:underline">Sign up</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
