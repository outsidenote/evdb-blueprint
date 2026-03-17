/**
 * Code generator: scans swimlane event and view folders and generates static barrel files.
 *
 * Usage:
 *   npx tsx scripts/gen-events.ts
 *   npm run gen:events
 *
 * For each swimlane:
 * - Generates `events/_generated.ts` with a composed `applyAllEvents` function
 * - Generates `views/_generated.ts` with a composed `applyAllViews` function
 *
 * The generated files are checked into source control — they're static TypeScript
 * that preserves full type safety while giving you auto-discovery at dev time.
 */

import { readdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { globSync } from "glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");

const HEADER = `// AUTO-GENERATED — do not edit manually.
// Run \`npm run gen:events\` to regenerate after adding/removing event or view folders.
`;

function findModules(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .filter((dirent) => existsSync(join(dir, dirent.name, "index.ts")))
    .map((dirent) => dirent.name)
    .sort();
}

// Find all swimlane directories
const swimlaneDirs = globSync("src/BusinessCapabilities/**/swimlanes/*", { cwd: rootDir });

for (const swimlaneDir of swimlaneDirs) {
  // ── Events ──
  const eventsDir = join(rootDir, swimlaneDir, "events");
  const eventModules = findModules(eventsDir);

  if (eventModules.length > 0) {
    const entries = eventModules.map((name) => ({
      module: name,
      importName: `with${name}`,
    }));

    const imports = entries
      .map((e) => `import ${e.importName} from "./${e.module}/index.js";`)
      .join("\n");

    const applyChain = entries.reduceRight(
      (inner, e) => `${e.importName}(${inner})`,
      "builder",
    );

    const content = `${HEADER}
import type { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { EvDbView } from "@eventualize/core/view/EvDbView";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

${imports}

export function applyAllEvents<
  TStreamType extends string,
  TEvents extends IEvDbEventPayload = never,
  TViews extends Record<string, EvDbView<unknown>> = {},
>(builder: StreamFactoryBuilder<TStreamType, TEvents, TViews>) {
  return ${applyChain};
}
`;

    const outputPath = join(eventsDir, "_generated.ts");
    writeFileSync(outputPath, content, "utf-8");
    console.log(`Generated: ${outputPath.replace(rootDir + "/", "")} (${eventModules.length} events)`);
  }

  // ── Views ──
  const viewsDir = join(rootDir, swimlaneDir, "views");
  const viewModules = findModules(viewsDir);

  if (viewModules.length > 0) {
    const imports = viewModules
      .map((name) => `import { viewName as ${name}Name, defaultState as ${name}DefaultState, handlers as ${name}Handlers } from "./${name}/index.js";`)
      .join("\n");

    const withViewChain = viewModules
      .map((name) => `    .withView(${name}Name, ${name}DefaultState, ${name}Handlers as any)`)
      .join("\n");

    const content = `${HEADER}
import type { StreamFactoryBuilder } from "@eventualize/core/factories/StreamFactoryBuilder";
import type { EvDbView } from "@eventualize/core/view/EvDbView";
import type IEvDbEventPayload from "@eventualize/types/events/IEvDbEventPayload";

${imports}

// Handler type safety is enforced in each view's handlers.ts file.
// The 'as any' bypasses the redundant TEvents check at the wiring level
// while preserving full view state types downstream (stream.views.X.balance).
export function applyAllViews<
  TStreamType extends string,
  TEvents extends IEvDbEventPayload,
  TViews extends Record<string, EvDbView<unknown>> = {},
>(builder: StreamFactoryBuilder<TStreamType, TEvents, TViews>) {
  return builder
${withViewChain};
}
`;

    const outputPath = join(viewsDir, "_generated.ts");
    writeFileSync(outputPath, content, "utf-8");
    console.log(`Generated: ${outputPath.replace(rootDir + "/", "")} (${viewModules.length} views)`);
  }
}
