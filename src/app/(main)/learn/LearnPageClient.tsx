"use client";

import LearnerEpisodeWorkspace from "@/components/learner/LearnerEpisodeWorkspace";
import { useUiVersion } from "@/components/settings/UiVersionProvider";
import V2LearnerEpisodeWorkspace from "@/components/v2/V2LearnerEpisodeWorkspace";

export default function LearnPageClient() {
  const { uiVersion } = useUiVersion();

  if (uiVersion === "v2") {
    return <V2LearnerEpisodeWorkspace />;
  }

  return <LearnerEpisodeWorkspace />;
}
