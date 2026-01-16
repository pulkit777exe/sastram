import { LoginForm } from "@/components/auth";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export default function LoginPage() {
  return (
    <div className="bg-background">
      <ThemeToggle />
      <LoginForm />
    </div>
  );
}
