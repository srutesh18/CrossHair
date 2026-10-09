import { Suspense } from "react";
import { LoginForm } from "@/components/ui/LoginForm";
import { LoadingState } from "@/components/ui/States";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading sign in" />}>
      <LoginForm />
    </Suspense>
  );
}
