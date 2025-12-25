"use client";

import * as React from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoaderIcon } from "lucide-react";
import { signIn, signUp } from "@/lib/auth-client";

function UserAuthForm({
  className,
  mode,
  setMode,
  ...props
}: React.ComponentProps<"div"> & {
  mode: "signin" | "signup";
  setMode: (mode: "signin" | "signup") => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingState, setLoadingState] = useState<
    "email" | "github" | "google" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingState("email");
    setError(null);

    try {
      if (mode === "signup") {
        await signUp.email({
          email,
          password,
          name: name || email.split("@")[0], // Use email prefix if no name provided
          callbackURL: "/dashboard",
        });
        router.push("/dashboard");
      } else {
        await signIn.email({
          email,
          password,
          callbackURL: "/dashboard",
        });
        router.push("/dashboard");
      }
    } catch (error) {
      console.error(`${mode === "signup" ? "Signup" : "Login"} failed:`, error);
      setError(
        (error instanceof Error ? error.message : null) ||
          `${mode === "signup" ? "Signup" : "Login"} failed. Please try again.`
      );
    } finally {
      setLoadingState(null);
    }
  };

  const handleSocialLogin = async (provider: "google" | "github") => {
    setLoadingState(provider);
    setError(null);
    try {
      await signIn.social({
        provider,
        callbackURL: "/dashboard",
      });
      router.push("/dashboard");
    } catch (error) {
      console.error("Social login failed:", error);
      setError(
        (error instanceof Error ? error.message : null) ||
          "Social login failed. Please try again."
      );
    } finally {
      setLoadingState(null);
    }
  };

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <form onSubmit={handleEmailAuth}>
        <div className="grid gap-4">
          {mode === "signup" && (
            <div className="grid gap-2">
              <Label className="sr-only" htmlFor="name">
                Name
              </Label>
              <Input
                id="name"
                placeholder="Your name"
                type="text"
                autoCapitalize="words"
                autoComplete="name"
                autoCorrect="off"
                disabled={loadingState !== null}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-grey-500 transition-all"
              />
            </div>
          )}
          <div className="grid gap-2">
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
              className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-grey-500 transition-all"
            />
          </div>
          <div className="grid gap-2">
            <Label className="sr-only" htmlFor="password">
              Password
            </Label>
            <Input
              id="password"
              placeholder="Password"
              type="password"
              autoCapitalize="none"
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              autoCorrect="off"
              disabled={loadingState !== null}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 rounded-xl border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-grey-500 transition-all"
            />
          </div>
          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <Button
            disabled={loadingState !== null}
            type="submit"
            className="h-11 rounded-xl bg-black hover:bg-black/80 text-white font-medium shadow-lg shadow-black/30 transition-all hover:shadow-black/40"
          >
            {loadingState === "email" && (
              <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
            )}
            {mode === "signup" ? "Create Account" : "Sign In with Email"}
          </Button>
        </div>
      </form>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-400">Or continue with</span>
        </div>
      </div>
      <div className="flex gap-4">
        <Button
          variant="outline"
          type="button"
          disabled={loadingState !== null}
          onClick={() => handleSocialLogin("github")}
          className="flex-1 h-11 rounded-xl border-slate-200 hover:bg-slate-50 hover:text-slate-900"
        >
          {loadingState === "github" ? (
            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Image
              src="/github.png"
              alt="GitHub"
              width={16}
              height={16}
              className="mr-2 opacity-70"
            />
          )}
          GitHub
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={loadingState !== null}
          onClick={() => handleSocialLogin("google")}
          className="flex-1 h-11 rounded-xl border-slate-200 hover:bg-slate-50 hover:text-slate-900"
        >
          {loadingState === "google" ? (
            <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Image
              src="/google.png"
              alt="Google"
              width={16}
              height={16}
              className="mr-2 opacity-70"
            />
          )}
          Google
        </Button>
      </div>
      <div className="text-center text-sm">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
          className="text-slate-600 hover:text-slate-900 underline underline-offset-4"
        >
          {mode === "signin"
            ? "Don't have an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}

export function LoginForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  return (
    <div className="relative container flex-1 shrink-0 items-center justify-center md:grid lg:max-w-none lg:grid-cols-2 lg:px-0 min-h-screen bg-white">
      <div className="relative hidden h-full flex-col bg-slate-900 p-10 text-white lg:flex dark:border-r">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1759818319027-dc631ed9732b?q=80&w=2036&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D)",
          }}
        />
        <div className="relative z-20 flex items-center text-lg font-bold tracking-tight">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-black mr-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5 text-white"
            >
              <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
            </svg>
          </div>
          Sastram
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              &ldquo;This library has saved me countless hours of work and
              helped me deliver stunning designs to my clients faster than ever
              before.&rdquo;
            </p>
            <footer className="text-sm text-slate-400">Sofia Davis</footer>
          </blockquote>
        </div>
      </div>
      <div className="flex items-center justify-center lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mx-auto flex w-full flex-col justify-center gap-6 sm:w-[350px]"
        >
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              {mode === "signin" ? "Welcome back" : "Create an account"}
            </h1>
            <p className="text-slate-500 text-sm">
              {mode === "signin"
                ? "Enter your email below to sign in to your account"
                : "Enter your details below to create your account"}
            </p>
          </div>
          <UserAuthForm mode={mode} setMode={setMode} />
          <p className="px-8 text-center text-sm text-slate-400">
            By clicking continue, you agree to our{" "}
            <Link
              href="/terms"
              className="underline underline-offset-4 hover:text-slate-900"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-4 hover:text-slate-900"
            >
              Privacy Policy
            </Link>
            .
          </p>
        </motion.div>
      </div>
    </div>
  );
}
