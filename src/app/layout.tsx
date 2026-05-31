import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "FuelUp — Calorie & Fitness Tracker",
  description: "Track calories, workouts, body metrics, and habits all in one app. Your all-in-one fitness companion.",
  keywords: ["calorie tracker", "fitness", "workout", "habits", "body metrics"],
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b0b0c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark" suppressHydrationWarning>
      <body className="min-h-full bg-[#0b0b0c] text-[#f5f5f5] font-sans antialiased">
        <ClerkProvider
          appearance={{
            baseTheme: dark,
            variables: {
              colorPrimary: "#f59e0b",
              colorBackground: "#111111",
              colorInputBackground: "rgba(255,255,255,0.04)",
              colorInputText: "#ffffff",
              colorText: "#ffffff",
              colorTextSecondary: "#a1a1aa",
              borderRadius: "14px",
              fontFamily: "'Inter', system-ui, sans-serif",
            },
            elements: {
              // Card
              card: "!bg-[rgba(17,17,17,0.85)] !backdrop-blur-xl !border !border-[rgba(255,255,255,0.08)] !shadow-[0_20px_60px_rgba(0,0,0,0.5),0_0_40px_rgba(245,158,11,0.06)] !rounded-[24px]",

              // Header — high contrast
              headerTitle: "!text-white !font-bold !text-[22px]",
              headerSubtitle: "!text-[#a1a1aa] !text-[14px]",

              // Social / Google button
              socialButtonsBlockButton:
                "!h-[50px] !rounded-[12px] !bg-[#161616] !border !border-[rgba(255,255,255,0.1)] !text-white !font-semibold hover:!bg-[#1e1e1e] hover:!border-[rgba(255,255,255,0.16)] !transition-all !duration-200",
              socialButtonsBlockButtonText: "!font-semibold !text-[14px]",

              // Divider
              dividerLine: "!bg-[rgba(255,255,255,0.1)]",
              dividerText: "!text-[#71717a] !text-[13px]",

              // Form inputs
              formFieldInput:
                "!h-[50px] !rounded-[12px] !bg-[rgba(255,255,255,0.04)] !border-[rgba(255,255,255,0.1)] !text-white !text-[14px] focus:!border-[#f59e0b] focus:!shadow-[0_0_0_3px_rgba(245,158,11,0.15)] !transition-all !duration-200 !placeholder-[#6b7280]",
              formFieldLabel: "!text-[#d1d5db] !text-[13px] !font-medium",
              formFieldAction: "!text-[#f59e0b] !font-medium",
              formFieldInputShowPasswordButton: "!text-[#71717a] hover:!text-white",

              // Primary button
              formButtonPrimary:
                "!h-[50px] !rounded-[14px] !bg-gradient-to-r !from-[#f59e0b] !to-[#ff7b00] !text-[#0b0b0c] !font-bold !text-[15px] hover:!shadow-[0_12px_32px_rgba(245,158,11,0.3)] hover:!translate-y-[-1px] !transition-all !duration-200",

              // Footer
              footerActionLink: "!text-[#f59e0b] !font-semibold hover:!text-[#fbbf24]",
              footerActionText: "!text-[#9ca3af] !text-[13px]",
              footer: "!bg-transparent",
              footerPages: "!bg-transparent",
              footerPagesLink: "!text-[#6b7280]",

              // Identity preview
              identityPreview: "!bg-[rgba(255,255,255,0.04)] !border-[rgba(255,255,255,0.1)] !rounded-[12px]",
              identityPreviewText: "!text-[#d1d5db]",
              identityPreviewEditButton: "!text-[#f59e0b]",

              // OTP
              otpCodeFieldInput:
                "!h-[50px] !rounded-[10px] !bg-[rgba(255,255,255,0.04)] !border-[rgba(255,255,255,0.1)] !text-white !text-[18px] !font-bold focus:!border-[#f59e0b] focus:!shadow-[0_0_0_3px_rgba(245,158,11,0.15)]",

              // Alert
              alert: "!bg-[rgba(239,68,68,0.1)] !border-[rgba(239,68,68,0.2)] !rounded-[10px] !text-[#fca5a5]",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
