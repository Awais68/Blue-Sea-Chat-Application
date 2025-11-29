import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../contexts/AuthContext";

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated) {
        router.push("/rooms");
      } else {
        router.push("/login");
      }
    }
  }, [isAuthenticated, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-primary-blue mx-auto"></div>
        <p className="mt-4 text-primary-silver">Loading...</p>
      </div>
    </div>
  );
}
