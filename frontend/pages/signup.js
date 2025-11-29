import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { signup, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/rooms");
    }
  }, [isAuthenticated, router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const result = await signup(username, email, password);

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
            Create Account
          </h2>
          <p className="mt-2 text-center text-sm text-primary-silver">
            Join our WebRTC chat platform
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
                htmlFor="username"
                className="block text-sm font-medium text-primary-silver mb-2"
              >
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 bg-dark-hover placeholder-gray-400 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                placeholder="Choose a username"
              />
            </div>

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
                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 bg-dark-hover placeholder-gray-400 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
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
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 bg-dark-hover placeholder-gray-400 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                placeholder="Create a password"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-primary-silver mb-2"
              >
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-3 border border-gray-600 bg-dark-hover placeholder-gray-400 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-purple focus:border-transparent"
                placeholder="Confirm your password"
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-primary-purple to-primary-blue hover:from-primary-blue hover:to-primary-purple focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-purple transition-all duration-300 disabled:opacity-50"
            >
              {loading ? "Creating account..." : "Sign up"}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-primary-silver">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="font-medium text-primary-purple hover:text-primary-blue transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
