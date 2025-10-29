"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { Github } from "lucide-react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signIn.email({ email, password });
      router.push("/chat");
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSocialLogin = async (provider: "google" | "github") => {
    await signIn.social({ provider });
  };

  return (
    <Card className="p-6 w-full max-w-md">
      <h2 className="text-2xl font-bold mb-6">Sign In</h2>
      
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in..." : "Sign In"}
        </Button>
      </form>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">Or continue with</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button variant="outline" onClick={() => handleSocialLogin("google")}>
          Google
        </Button>
        <Button variant="outline" onClick={() => handleSocialLogin("github")}>
          <Github className="mr-2 h-4 w-4" />
          GitHub
        </Button>
      </div>
    </Card>
  );
}