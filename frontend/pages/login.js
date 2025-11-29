import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { login, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/rooms");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      router.push("/rooms");
    } else {
      setError(result.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-bg px-4">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-4xl font-extrabold text-white">
            Welcome Back
          </h2>
          <p className="mt-2 text-center text-sm text-primary-silver">
            Sign in to your account
          </p>
        </div>

        <form
          className="mt-8 space-y-6 bg-dark-card p-8 rounded-lg shadow-xl"
          onSubmit={handleSubmit}
        >
          {error && (
            <div className="bg-red-500 bg-opacity-20 border border-red-500 text-red-500 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-primary-silver mb-2"
              >
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 bg-dark-hover placeholder-gray-400 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-primary-silver mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 bg-dark-hover placeholder-gray-400 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-blue focus:border-transparent"
                placeholder="Enter your password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-primary-blue to-primary-purple hover:from-primary-purple hover:to-primary-blue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-blue transition-all duration-300 disabled:opacity-50"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-primary-silver">
              Don't have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/signup")}
                className="font-medium text-primary-blue hover:text-primary-purple transition-colors"
              >
                Sign up
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
