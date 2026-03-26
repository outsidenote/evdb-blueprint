# EvDB Blueprint — Improvement Suggestions

Review of the TypeScript event-sourced blueprint app using `eventualize-js` with Express, pg-boss, Kafka, and Prisma.

---

## High Priority

### 1. Bump tsconfig `target` to `ES2022`+

**File:** `tsconfig.json:3`

Currently `"target": "ES2020"`. Since Node 20+ is required (TS 5.9, `@types/node@24`), use `ES2022` or `ESNext` to get native `Object.hasOwn`, top-level await, `Array.at()`, `Error.cause`, etc.

### 2. No `files` field in `package.json`

**File:** `package.json`

If this ever gets published, it would ship the entire repo including tests. Add:

```json
"files": ["dist"]
```

### 3. Commands/events as classes are verbose

**Files:** `src/BusinessCapabilities/Funds/slices/WithdrawFunds/command.ts`, `src/BusinessCapabilities/Funds/swimlanes/Funds/events/FundsWithdrawn.ts`, and similar

Every command and event duplicates all props as class fields + constructor assignment. Since these are data carriers with a discriminant, plain objects with a factory would halve the boilerplate:

```ts
// Instead of a class with constructor + field mirroring:
export interface WithdrawFunds extends WithdrawFundsProps {
  readonly commandType: "WithdrawFunds";
}
export const WithdrawFunds = (props: WithdrawFundsProps): WithdrawFunds => ({
  commandType: "WithdrawFunds",
  ...props,
});
```

> Evaluate whether the class form is required by the eventualize framework before changing.

### 4. Dead code in `gwts.ts`

**File:** `src/BusinessCapabilities/Funds/slices/WithdrawFunds/gwts.ts:16`

Leftover `// 1 === 2;` comment should be removed.

### 5. Unsafe type casts in `PgBossEndpointConfig`

**File:** `src/types/abstractions/endpoints/PgBossEndpointFactory.ts:71-72`

Casts `TPayload` handlers to `Record<string, unknown>`, defeating generic type safety:

```ts
this.handler = config.handler as (payload: Record<string, unknown>, ...) => Promise<void>;
```

Consider keeping the generic through the interface or using a different approach that doesn't erase the type.

### 6. `PgBossEndpointConfigBase` duplicates `PgBossEndpointConfig`

**File:** `src/types/abstractions/endpoints/PgBossEndpointFactory.ts:41-78`

The interface and class share almost identical fields. The interface has `queueName` as a field while the class has it as a getter. Unify to reduce drift.

---

## Medium Priority

### 7. No `engines` field

**File:** `package.json`

Given Node 20+ is required, add:

```json
"engines": { "node": ">=20" }
```

### 8. Missing `typecheck` script

**File:** `package.json`

There's `build` (runs `tsc --build`) but no standalone typecheck for CI. Add:

```json
"typecheck": "tsc --noEmit"
```

### 9. `.gitignore` is bloated

**File:** `.gitignore`

Contains Gatsby, Nuxt, SvelteKit, VuePress, Vitepress, Firebase, DynamoDB entries — none of which this project uses. Trim to what's relevant: `node_modules/`, `dist/`, `*.tsbuildinfo`, `.env*`, `coverage/`, logs.

### 10. Unnecessary double closure in `CommandHandlerOrchestratorFactory`

**File:** `src/types/abstractions/commands/CommandHandlerOrchestratorFactory.ts:59-61`

```ts
return async (command: TCommand): Promise<CommandHandlerOrchestratorResult> => {
  return orchestrate(command);
};
```

Just `return orchestrate;` — the inner function already has the right signature.

### 11. Behaviour test assertions seem inverted

**File:** `src/tests/behaviour.test.ts:41-42`

The test name says "sufficient funds" but asserts `FundsWithdrawalDeclined`. Either the test name or the assertion is wrong.

### 12. Consider `vitest` over Node's built-in test runner

The project uses `node:test` + `node:assert`. While functional, `vitest` provides:

- Watch mode, parallel execution, better DX
- Snapshot testing (useful for event payload assertions)
- Coverage built-in
- Better IDE integration

This is a preference call, but given the project complexity it would pay off.

---

## Low Priority

### 13. `"main": "./dist/server.js"` is unusual for a private app

Since `"private": true`, the `main` field isn't used for resolution. It's harmless but misleading — consider removing it or documenting it's for tooling.

### 14. Deep relative imports in slices

**Example:** `src/BusinessCapabilities/Funds/slices/WithdrawFunds/commandHandler.ts:1`

Files use `../../../../types/abstractions/...`. tsconfig `paths` aliases would clean this up:

```json
"paths": {
  "#abstractions/*": ["./src/types/abstractions/*"]
}
```

### 15. `kafkajs` is a devDependency but used in production code

**File:** `package.json:46`

`kafkajs` is listed under `devDependencies`, but `server.ts:3` imports it directly. It should be in `dependencies`.

### 16. No lockfile committed

No `package-lock.json` or equivalent is present. For reproducible builds, commit the lockfile.

---

## Summary

The event-sourcing architecture is solid. The highest-impact changes are:

1. **Bug:** Fix `kafkajs` dependency placement (devDep -> dep)
2. **Bug:** Verify the inverted test assertion in `behaviour.test.ts`
3. **Type safety:** Clean up type casts in `PgBossEndpointConfig`
4. **Modernize:** Bump TS target to `ES2022`+
5. **DX:** Add path aliases, `engines`, `typecheck` script
