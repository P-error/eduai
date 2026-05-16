import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  buildMockRealUserTrainingObservationExport,
  exportRealUserTrainingObservations,
} from "@/lib/ml-six-factor-real-user-export";

type CliOptions = {
  out: string | null;
  limit: number | null;
  since: string | null;
  includeOutcomeMissing: boolean;
  dryRun: boolean;
  smokeOnly: boolean;
  datasetOriginPrefix: string | null;
  strictEpisodeOutcomeLinking: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    out: null,
    limit: null,
    since: null,
    includeOutcomeMissing: false,
    dryRun: false,
    smokeOnly: false,
    datasetOriginPrefix: null,
    strictEpisodeOutcomeLinking: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") {
      options.out = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--limit") {
      const parsed = Number(argv[index + 1]);
      options.limit = Number.isFinite(parsed) ? Math.floor(parsed) : null;
      index += 1;
    } else if (arg === "--since") {
      options.since = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--include-outcome-missing") {
      options.includeOutcomeMissing = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--smoke-only") {
      options.smokeOnly = true;
    } else if (arg === "--dataset-origin-prefix") {
      options.datasetOriginPrefix = argv[index + 1] ?? null;
      index += 1;
    } else if (arg === "--strict-episode-outcome-linking") {
      options.strictEpisodeOutcomeLinking = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function writeJsonl(outPath: string, rows: unknown[]) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  const content = rows.length > 0
    ? `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`
    : "";
  writeFileSync(outPath, content, "utf8");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.out) {
    throw new Error("--out is required");
  }

  const result = options.dryRun
    ? buildMockRealUserTrainingObservationExport()
    : await (async () => {
        const prisma = new PrismaClient();
        try {
          return await exportRealUserTrainingObservations(prisma, {
          limit: options.limit,
          since: options.since,
          includeOutcomeMissing: options.includeOutcomeMissing,
          smokeOnly: options.smokeOnly,
          datasetOriginPrefix: options.datasetOriginPrefix,
          strictEpisodeOutcomeLinking: options.strictEpisodeOutcomeLinking,
        });
      } finally {
        await prisma.$disconnect();
        }
      })();

  writeJsonl(options.out, result.observations);
  console.log(
    JSON.stringify(
      {
        out: options.out,
        dryRun: options.dryRun,
        smokeOnly: options.smokeOnly,
        datasetOriginPrefix: options.datasetOriginPrefix,
        strictEpisodeOutcomeLinking: options.strictEpisodeOutcomeLinking,
        ...result.summary,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
