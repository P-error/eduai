import type { Metadata } from "next";
import { Suspense } from "react";
import DemoWorkspace from "@/components/demo/DemoWorkspace";

export const metadata: Metadata = {
  title: "EduAI Demo",
  description: "Simulated showcase route for EduAI.",
};

export default function DemoPage() {
  return <Suspense fallback={null}><DemoWorkspace /></Suspense>;
}
