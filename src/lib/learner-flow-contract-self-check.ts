import { prisma } from "@/lib/prisma";
import { issueToken } from "@/lib/auth";
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants";
import { GET as learnerFlowEntryRoute } from "@/app/api/learner-flow/entry/route";
import {
  DEFAULT_LEARNER_ENTRY_HREF,
  pickPostAuthRedirectHref,
  readSafeNextHref,
} from "@/lib/learner-flow-contract";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildRequest(token?: string | null) {
  const headers = new Headers();
  if (token) {
    headers.set("cookie", `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`);
  }

  return new Request("http://localhost/api/learner-flow/entry", {
    method: "GET",
    headers,
  });
}

async function responseJson<T>(response: Response) {
  return (await response.json()) as T;
}

async function cleanupUser(userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.evaluationEpisode.deleteMany({
      where: { userId },
    });
    await tx.subject.deleteMany({
      where: { userId },
    });
    await tx.user.deleteMany({
      where: { id: userId },
    });
  });
}

export async function runLearnerFlowContractSelfCheck() {
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: {
      externalId: `learner-flow-contract-self-check:${stamp}`,
      email: `learner-flow-contract-self-check-${stamp}@eduai.local`,
      name: "Learner Flow Contract Self Check",
    },
  });

  const token = issueToken({ userId: user.id });

  try {
    const unauthorizedResponse = await learnerFlowEntryRoute(buildRequest());
    assert(
      unauthorizedResponse.status === 401,
      "entry route must require authentication",
    );

    const noSubjectResponse = await learnerFlowEntryRoute(buildRequest(token));
    assert(noSubjectResponse.ok, "entry route must resolve for authenticated learner");
    const noSubjectPayload = await responseJson<{
      target?: { kind?: string; href?: string };
    }>(noSubjectResponse);
    assert(
      noSubjectPayload.target?.kind === "topics" &&
        noSubjectPayload.target.href === "/topics?entry=setup",
      "learner without topics must route to Topics setup",
    );

    const subject = await prisma.subject.create({
      data: {
        userId: user.id,
        title: "Learner Flow Contract Topic",
      },
    });

    const learnResponse = await learnerFlowEntryRoute(buildRequest(token));
    assert(learnResponse.ok, "entry route must resolve learn target with subject");
    const learnPayload = await responseJson<{
      target?: { kind?: string; href?: string };
    }>(learnResponse);
    assert(
      learnPayload.target?.kind === "learn" && learnPayload.target.href === "/learn",
      "learner with subject and no active episode must route to Learn",
    );

    const episode = await prisma.evaluationEpisode.create({
      data: {
        userId: user.id,
        subjectId: subject.id,
        objectiveKey: "self_check",
        protocolKey: "self_check_protocol",
        policyArm: "predicted",
        primarySignalKind: "test_outcome",
        topic: "Self-check episode",
        assignmentJson: {},
        designJson: {},
      },
    });

    const resumeResponse = await learnerFlowEntryRoute(buildRequest(token));
    assert(resumeResponse.ok, "entry route must resolve resume target");
    const resumePayload = await responseJson<{
      target?: { kind?: string; href?: string };
    }>(resumeResponse);
    assert(
      resumePayload.target?.kind === "resume" &&
        resumePayload.target.href === `/learn?episode=${episode.id}&resume=1`,
      "learner with active episode must route to explicit resume branch",
    );

    assert(
      pickPostAuthRedirectHref(null) === DEFAULT_LEARNER_ENTRY_HREF,
      "missing next must fall back to learner entry resolver",
    );
    assert(
      readSafeNextHref("/learn") === DEFAULT_LEARNER_ENTRY_HREF,
      "raw Learn next path must normalize to learner entry resolver",
    );
    assert(
      readSafeNextHref("https://example.com/learn") == null,
      "external next href must be rejected",
    );

    return {
      ok: true,
      checks: [
        "unauthorized learner entry -> 401",
        "no subjects -> /topics?entry=setup",
        "has subject and no active episode -> /learn",
        "has active episode -> /learn?episode=<id>&resume=1",
        "post-auth next normalization keeps /learn state-aware",
      ],
    };
  } finally {
    await cleanupUser(user.id);
  }
}
