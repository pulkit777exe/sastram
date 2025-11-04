"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoaderIcon } from "lucide-react";
import { signIn } from "@/lib/auth-client";

function UserAuthForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingState, setLoadingState] = useState<"email" | "github" | "google" | null>(null);
  const router = useRouter();

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingState("email");
    try {
      await signIn.email({ 
        email, 
        password,
        callbackURL: "/chat"
      });
      router.push("/chat");
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoadingState(null);
    }
  };

  const handleSocialLogin = async (provider: "google" | "github") => {
    setLoadingState(provider);
    try {
      await signIn.social({ 
        provider,
        callbackURL: "/chat"
      });
      router.push("/chat");
    } catch (error) {
      console.error("Social login failed:", error);
    } finally {
      setLoadingState(null);
    }
  };

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <form onSubmit={handleEmailLogin}>
        <div className="grid gap-2">
          <div className="grid gap-1">
            <Label className="sr-only" htmlFor="email">
              Email
            </Label>
            <Input
              id="email"
              placeholder="name@example.com"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect="off"
              disabled={loadingState !== null}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1">
            <Label className="sr-only" htmlFor="password">
              Password
            </Label>
            <Input
              id="password"
              placeholder="Password"
              type="password"
              autoCapitalize="none"
              autoComplete="current-password"
              autoCorrect="off"
              disabled={loadingState !== null}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <Button disabled={loadingState !== null} type="submit">
            {loadingState === "email" && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
            Sign In with Email
          </Button>
        </div>
      </form>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background text-muted-foreground px-2">
            Or continue with
          </span>
        </div>
      </div>
      <div className="flex gap-4">
        <Button
          variant="outline"
          type="button"
          disabled={loadingState !== null}
          onClick={() => handleSocialLogin("github")}
          className="flex-1"
        >
          {loadingState === "github" ? (
            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Image
              src="/github.png"
              alt="GitHub"
              width={16}
              height={16}
              className="mr-2"
            />
          )}
          GitHub
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={loadingState !== null}
          onClick={() => handleSocialLogin("google")}
          className="flex-1"
        >
          {loadingState === "google" ? (
            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Image
              src="/google.png"
              alt="Google"
              width={16}
              height={16}
              className="mr-2"
            />
          )}
          Google
        </Button>
      </div>
    </div>
  );
}

export function LoginForm() {
  return (
    <div className="relative container flex-1 shrink-0 items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="text-primary relative hidden h-full flex-col p-10 lg:flex dark:border-r">
        <div
          className="bg-primary/5 absolute inset-0"
          style={{
            backgroundImage: "url(https://images.unsplash.com/photo-1499428665502-503f6c608263?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&q=80&w=1170)",
            backgroundSize: "cover",
            backgroundPosition: "center"
          }}
        />
        <div className="relative z-20 flex items-center text-lg font-medium text-white/80">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-2 h-6 w-6">
            <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
          </svg>
          Sastram
        </div>
        <div className="relative z-20 mt-auto max-w-3xl text-white/70">
          <blockquote className="leading-normal text-balance">
            &ldquo;Community is the source of growth.&rdquo; - Sofia Davis
          </blockquote>
        </div>
      </div>
      <div className="flex items-center justify-center lg:h-screen lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center gap-6 sm:w-[350px]">
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to your account</h1>
            <p className="text-muted-foreground text-sm">
              Enter your email below to sign in to your account
            </p>
          </div>
          <UserAuthForm />
          <p className="text-muted-foreground px-8 text-center text-sm">
            By clicking continue, you agree to our{" "}
            <Link href="/terms" className="hover:text-primary underline underline-offset-4">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="hover:text-primary underline underline-offset-4">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}