import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { emailOTP } from "better-auth/plugins";
import { oAuthProxy } from "better-auth/plugins";
import { prisma } from "./prisma";
import { getEnv } from "./schemas/env";

const env = getEnv();

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false,
      },
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID || "",
      clientSecret: env.GOOGLE_CLIENT_SECRET || "",
    },
    github: {
      clientId: env.GITHUB_CLIENT_ID || "",
      clientSecret: env.GITHUB_CLIENT_SECRET || "",
    },
  },
  plugins: [
    oAuthProxy({
      currentURL: "http://localhost:3000",
      productionURL: process.env.NEXT_PUBLIC_APP_URL,
    }),
    emailOTP({
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "sign-in") {
          if (!email) return;
          // Send the OTP for sign in
          console.log("Sign in OTP:", otp);
        } else if (type === "email-verification") {
          if (!email || !otp) return;
          // Send the OTP for email verification
          console.log("Email verification OTP:", otp);
        } else {
          // Send the OTP for password reset
          console.log("Password reset OTP:", otp);
        }
      },
    }),
  ],
});
