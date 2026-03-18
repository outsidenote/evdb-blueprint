import { Router, type Response } from "express";
import { collectByKeys, type IProjectionRepository, type ProjectionRow } from "../projections/ProjectionRepository.js";
import {
  parseProjectionQuery,
  nextAfterKey,
  QueryValidationError,
} from "./projectionQueryParser.js";


export interface ProjectionRouterLogger {
  error(message: string, context?: Record<string, unknown>): void;
}

const defaultLogger: ProjectionRouterLogger = {
  error: (message, context) => console.error(`[ProjectionRouter] ${message}`, context ?? ""),
};


function respondItem(res: Response, row: ProjectionRow): void {
  res.json({ item: row });
}

function respondItems(res: Response, rows: ProjectionRow[]): void {
  res.json({ items: rows });
}

function respondPage(res: Response, rows: ProjectionRow[], hasMore: boolean): void {
  res.json({
    items: rows,
    nextAfterKey: hasMore ? nextAfterKey(rows) : undefined,
  });
}

function badRequest(res: Response, message: string): void {
  res.status(400).json({ error: message });
}

function notFound(res: Response, message: string): void {
  res.status(404).json({ error: message });
}


/**
 * Projection query routes.
 *
 * GET /api/projections/:projectionName
 *
 * Query modes (mutually exclusive — ambiguous combos return 400):
 *   ?key=<single-key>                              → { item }
 *   ?keys=<k1>,<k2>,...                             → { items }
 *   ?from=<start>&to=<end>[&afterKey=x][&limit=n]   → { items, nextAfterKey }
 */
export function createProjectionRouter(
  repository: IProjectionRepository,
  allowedProjections: ReadonlySet<string>,
  logger: ProjectionRouterLogger = defaultLogger,
): Router {
  const router = Router();

  router.get("/:projectionName", async (req, res) => {
    const { projectionName } = req.params;

    if (!allowedProjections.has(projectionName)) {
      notFound(res, `Unknown projection: ${projectionName}`);
      return;
    }

    let query;
    try {
      query = parseProjectionQuery(projectionName, req.query as Record<string, unknown>);
    } catch (err) {
      if (err instanceof QueryValidationError) {
        badRequest(res, err.message);
        return;
      }
      throw err;
    }

    try {
      switch (query.mode) {
        case "byKey": {
          const row = await repository.byKey(query.projectionName, query.key);
          if (!row) {
            notFound(res, `No projection found for key: ${query.key}`);
            return;
          }
          respondItem(res, row);
          return;
        }
        case "byKeys": {
          const rows = await collectByKeys(repository, query.projectionName, query.keys);
          respondItems(res, rows);
          return;
        }
        case "betweenKeys": {
          const page = await repository.betweenKeys(query.projectionName, query.from, query.to, {
            limit: query.limit,
            afterKey: query.afterKey,
            fromInclusive: query.fromInclusive,
            toInclusive: query.toInclusive,
          });
          respondPage(res, page.rows, page.hasMore);
          return;
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Query execution failed", { projectionName, mode: query.mode, error: message });
      res.status(500).json({ error: message });
    }
  });

  return router;
}
