#!/usr/bin/env python3
"""
Run all evdb-diff fixtures and generate reports.

Usage:
  python3 run_fixtures.py --root <project-root> [--fixtures <fixture1,fixture2,...>]

Outputs:
  .claude/test-fixtures/latest/
    ├── report.md
    ├── report.html
    ├── ci-report.json
    └── <fixture>/
        ├── script-output.json
        └── result.json
"""

import argparse
import html as html_mod
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path


def run_fixture(repo: Path, fixture: str, script: Path, results_dir: Path) -> dict:
    """Run a single fixture: create worktree, swap files, run script, compare, teardown."""

    worktree = Path(f"/tmp/evdb-test-{fixture}")
    fixture_dir = repo / ".claude" / "test-fixtures" / fixture
    expected_path = fixture_dir / "expected-diff.json"

    if not expected_path.exists():
        return {"fixture": fixture, "error": "No expected-diff.json", "summary": {"total": 0, "passed": 0, "failed": 0, "pass_rate": 1.0}}

    # Create worktree
    subprocess.run(["git", "worktree", "add", str(worktree), "-b", f"evdb-test-{fixture}", "HEAD"],
                   capture_output=True, cwd=str(repo))

    try:
        # Swap fixture files
        shutil.copy2(fixture_dir / "config.json", worktree / ".eventmodel" / "config.json")
        shutil.copy2(fixture_dir / "index.json", worktree / ".eventmodel" / ".slices" / "index.json")

        # Copy slice.json files if present
        slices_src = fixture_dir / "slices"
        if slices_src.is_dir():
            slices_dst = worktree / ".eventmodel" / ".slices"
            for src_file in slices_src.rglob("*.json"):
                rel = src_file.relative_to(slices_src)
                dst = slices_dst / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src_file, dst)

        # Copy implementation-hashes.json if fixture provides one
        hashes_src = fixture_dir / "implementation-hashes.json"
        if hashes_src.exists():
            shutil.copy2(hashes_src, worktree / ".eventmodel" / "implementation-hashes.json")

        # Handle deletions
        if fixture == "deleted-slice":
            shutil.rmtree(worktree / ".eventmodel" / ".slices" / "Funds" / "pendingwithdrawallookup", ignore_errors=True)
        if fixture == "multi-change":
            shutil.rmtree(worktree / ".eventmodel" / ".slices" / "Funds" / "accountbalancereadmodel", ignore_errors=True)

        # Run evdb-diff script
        start = time.time()
        result = subprocess.run(
            [sys.executable, str(script), "--root", str(worktree), "--json", "--verbose"],
            capture_output=True, text=True,
        )
        elapsed_ms = int((time.time() - start) * 1000)

        script_output = {}
        if result.stdout.strip():
            script_output = json.loads(result.stdout)

        # Load results
        with open(expected_path) as f:
            expected = json.load(f)

        with open(worktree / ".eventmodel" / ".slices" / "index.json") as f:
            actual_index = json.load(f)

        # Check hashes
        has_hashes = (worktree / ".eventmodel" / "implementation-hashes.json").exists()
        statuses = expected.get("expected_statuses", {})
        if not has_hashes and "expected_statuses_no_hashes" in expected:
            for k, v in expected["expected_statuses_no_hashes"].items():
                if k != "_note" and k in statuses:
                    statuses[k] = v

        actual_statuses = {s["folder"]: s["status"] for s in actual_index["slices"]}
        script_log = script_output.get("log", [])
        script_actions = script_output.get("actions", [])
        script_warnings = script_output.get("warnings", [])

        # Compare
        status_checks = []
        for folder, expected_status in statuses.items():
            actual_status = actual_statuses.get(folder, "MISSING")
            passed = expected_status == actual_status
            check = {"folder": folder, "expected": expected_status, "actual": actual_status, "pass": passed}
            if not passed:
                check["failure_type"] = "logic_error"
                check["diff"] = {"expected": expected_status, "actual": actual_status}
                check["explanation"] = [l for l in script_log if folder in l]
                check["actions"] = [a for a in script_actions if a.get("folder") == folder]
            status_checks.append(check)

        passed_count = sum(1 for c in status_checks if c["pass"])
        total = len(status_checks)

        # Save per-fixture results
        fixture_results_dir = results_dir / fixture
        fixture_results_dir.mkdir(parents=True, exist_ok=True)

        with open(fixture_results_dir / "script-output.json", "w") as f:
            json.dump(script_output, f, indent=2)

        fixture_result = {
            "fixture": fixture,
            "timestamp": datetime.now().isoformat(),
            "status_checks": status_checks,
            "actions": script_actions,
            "warnings": script_warnings,
            "metrics": {"execution_time_ms": elapsed_ms},
            "summary": {
                "total": total,
                "passed": passed_count,
                "failed": total - passed_count,
                "pass_rate": round(passed_count / total, 2) if total > 0 else 1.0,
            },
        }

        with open(fixture_results_dir / "result.json", "w") as f:
            json.dump(fixture_result, f, indent=2)

        return fixture_result

    finally:
        # Teardown
        subprocess.run(["git", "worktree", "remove", str(worktree), "--force"], capture_output=True, cwd=str(repo))
        subprocess.run(["git", "branch", "-D", f"evdb-test-{fixture}"], capture_output=True, cwd=str(repo))


def generate_markdown(fixtures_results: list[dict], total_time_ms: int) -> str:
    """Generate a markdown report."""
    total_checks = sum(r["summary"]["total"] for r in fixtures_results)
    total_passed = sum(r["summary"]["passed"] for r in fixtures_results)
    all_pass = total_passed == total_checks
    failures = [r for r in fixtures_results if r["summary"]["passed"] != r["summary"]["total"]]

    lines = [
        "# evdb-diff Fixture Test Report",
        "",
        f"**Date:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
        f"**Duration:** {total_time_ms}ms",
        f"**Status:** {'✅ ALL PASSED' if all_pass else '❌ FAILURES DETECTED'}",
        f"**Fixtures:** {len(fixtures_results)} | **Checks:** {total_passed}/{total_checks} | **Pass Rate:** {round(total_passed/total_checks*100) if total_checks else 100}%",
        "",
        "## Results",
        "",
    ]

    for r in fixtures_results:
        s = r["summary"]
        icon = "✅" if s["passed"] == s["total"] else "❌"
        lines.append(f"| {icon} | **{r['fixture']}** | {s['passed']}/{s['total']} |")

        # Show failures
        for c in r.get("status_checks", []):
            if not c["pass"]:
                lines.append(f"|   | ↳ `{c['folder']}`: expected `{c['expected']}`, got `{c['actual']}` |  |")
                for a in c.get("actions", []):
                    if "explanation" in a:
                        lines.append(f"|   | ↳ {a['explanation']} |  |")
                    if "recommendation" in a:
                        lines.append(f"|   | ↳ *{a['recommendation']}* |  |")

    if failures:
        lines.extend(["", "## Failures Detail", ""])
        for r in failures:
            lines.append(f"### {r['fixture']}")
            lines.append("")
            for c in r.get("status_checks", []):
                if not c["pass"]:
                    lines.append(f"**`{c['folder']}`**: expected `{c['expected']}`, got `{c['actual']}`")
                    if "explanation" in c:
                        lines.append("")
                        lines.append("Log trace:")
                        for line in c["explanation"]:
                            lines.append(f"  > {line.strip()}")
                    for a in c.get("actions", []):
                        if "explanation" in a:
                            lines.append(f"\n**Explanation:** {a['explanation']}")
                        if "recommendation" in a:
                            lines.append(f"\n**Recommendation:** {a['recommendation']}")
                    lines.append("")

    # Actions across all fixtures
    all_actions = []
    for r in fixtures_results:
        all_actions.extend(r.get("actions", []))

    if all_actions:
        lines.extend(["## Actions", ""])
        for a in all_actions:
            lines.append(f"- **[{a.get('action', '')}]** `{a.get('folder', '')}`: {a.get('explanation', a.get('reason', ''))}")

    # Warnings across all fixtures
    all_warnings = []
    for r in fixtures_results:
        all_warnings.extend(r.get("warnings", []))

    if all_warnings:
        lines.extend(["", "## Warnings", ""])
        for w in all_warnings:
            lines.append(f"- ⚠️ `{w.get('folder', '')}`: {w.get('warning', '')}")

    return "\n".join(lines)


def generate_html(fixtures_results: list[dict], total_time_ms: int) -> str:
    """Generate an HTML report."""
    total_checks = sum(r["summary"]["total"] for r in fixtures_results)
    total_passed = sum(r["summary"]["passed"] for r in fixtures_results)
    all_pass = total_passed == total_checks
    status_color = "#22c55e" if all_pass else "#ef4444"
    status_text = "ALL PASSED" if all_pass else "FAILURES DETECTED"

    h = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>evdb-diff Test Report</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px}}
.hdr{{text-align:center;margin-bottom:32px}}
.hdr h1{{font-size:24px;color:#f8fafc;margin-bottom:8px}}
.hdr .ts{{color:#94a3b8;font-size:14px}}
.sum{{display:flex;justify-content:center;gap:32px;margin-bottom:32px;padding:20px;background:#1e293b;border-radius:12px}}
.st{{text-align:center}}.st .v{{font-size:32px;font-weight:700}}.st .l{{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px}}
.bd{{display:inline-block;padding:4px 12px;border-radius:6px;font-size:13px;font-weight:600}}
.bp{{background:#166534;color:#86efac}}.bf{{background:#991b1b;color:#fca5a5}}
.cd{{background:#1e293b;border-radius:12px;margin-bottom:16px;overflow:hidden}}
.cd.hf{{border-left:4px solid #ef4444}}
.cd-h{{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;cursor:pointer}}
.cd-h:hover{{background:#334155}}
.cd-n{{font-size:16px;font-weight:600}}.cd-s{{font-size:14px;color:#94a3b8}}
.cd-b{{padding:0 20px 20px;display:none}}.cd.open .cd-b,.cd.hf .cd-b{{display:block}}
table{{width:100%;border-collapse:collapse;margin-top:12px}}
th{{text-align:left;padding:8px 12px;color:#94a3b8;font-size:12px;text-transform:uppercase;border-bottom:1px solid #334155}}
td{{padding:8px 12px;border-bottom:1px solid #1e293b;font-size:14px}}
.p{{color:#22c55e}}.f{{color:#ef4444}}.fr{{background:#1c1017}}
.fd{{color:#f87171;font-size:12px;padding-left:24px;font-family:monospace}}
.sec{{margin-top:16px}}.sec h4{{font-size:13px;color:#94a3b8;text-transform:uppercase;margin-bottom:8px}}
.act{{background:#0f172a;border-radius:8px;padding:12px 16px;margin-bottom:8px}}
.at{{font-weight:600;font-size:13px}}.at.implement{{color:#60a5fa}}.at.review{{color:#f59e0b}}
.ae{{color:#cbd5e1;font-size:13px;margin-top:4px}}.ar{{color:#94a3b8;font-size:12px;margin-top:4px;font-style:italic}}
.wn{{background:#1c1917;border-left:3px solid #f59e0b;padding:8px 12px;margin-bottom:4px;font-size:13px;color:#fde047}}
.lt{{cursor:pointer}}.lc{{background:#0f172a;border-radius:8px;padding:12px;font-family:monospace;font-size:12px;color:#94a3b8;max-height:300px;overflow-y:auto;display:none}}
.lo .lc{{display:block}}
.ft{{text-align:center;margin-top:32px;color:#475569;font-size:12px}}
</style></head><body>
<div class="hdr"><h1>evdb-diff Fixture Test Report</h1><div class="ts">{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} · {total_time_ms}ms</div></div>
<div class="sum">
<div class="st"><div class="v" style="color:{status_color}">{status_text}</div><div class="l">Status</div></div>
<div class="st"><div class="v">{len(fixtures_results)}</div><div class="l">Fixtures</div></div>
<div class="st"><div class="v">{total_passed}/{total_checks}</div><div class="l">Checks</div></div>
<div class="st"><div class="v" style="color:{'#22c55e' if all_pass else '#ef4444'}">{round(total_passed/total_checks*100) if total_checks else 100}%</div><div class="l">Pass Rate</div></div>
</div>"""

    for fd in fixtures_results:
        s = fd["summary"]
        badge = '<span class="bd bp">PASS</span>' if s["passed"] == s["total"] else '<span class="bd bf">FAIL</span>'
        fc = " hf" if s["passed"] != s["total"] else ""
        h += f'<div class="cd{fc}" onclick="this.classList.toggle(\'open\')">'
        h += f'<div class="cd-h"><span class="cd-n">{html_mod.escape(fd["fixture"])} {badge}</span><span class="cd-s">{s["passed"]}/{s["total"]} · {fd.get("metrics",{}).get("execution_time_ms",0)}ms</span></div>'
        h += '<div class="cd-b"><table><tr><th>Slice</th><th>Expected</th><th>Actual</th><th></th></tr>'

        for c in fd.get("status_checks", []):
            icon = '<span class="p">✓</span>' if c["pass"] else '<span class="f">✗</span>'
            rc = ' class="fr"' if not c["pass"] else ""
            h += f'<tr{rc}><td>{html_mod.escape(c["folder"])}</td><td>{html_mod.escape(c["expected"])}</td><td>{html_mod.escape(c["actual"])}</td><td>{icon}</td></tr>'
            if not c["pass"] and "explanation" in c:
                for line in c["explanation"]:
                    h += f'<tr class="fr"><td colspan="4" class="fd">| {html_mod.escape(line.strip())}</td></tr>'

        h += "</table>"

        actions = fd.get("actions", [])
        if actions:
            h += '<div class="sec"><h4>Actions</h4>'
            for a in actions:
                ac = a.get("action", "implement")
                h += f'<div class="act"><div class="at {ac}">[{html_mod.escape(ac)}] {html_mod.escape(a.get("folder",""))}</div>'
                h += f'<div class="ae">{html_mod.escape(a.get("explanation",""))}</div>'
                h += f'<div class="ar">{html_mod.escape(a.get("recommendation",""))}</div></div>'
            h += "</div>"

        warnings = fd.get("warnings", [])
        if warnings:
            h += '<div class="sec"><h4>Warnings</h4>'
            for w in warnings:
                h += f'<div class="wn">⚠ {html_mod.escape(w.get("folder",""))}: {html_mod.escape(w.get("warning",""))}</div>'
            h += "</div>"

        h += "</div></div>"

    h += '<div class="ft">evdb-test · deterministic fixture runner</div></body></html>'
    return h


def generate_ci_report(fixtures_results: list[dict], total_time_ms: int) -> dict:
    """Generate CI-compatible JSON report."""
    total_checks = sum(r["summary"]["total"] for r in fixtures_results)
    total_passed = sum(r["summary"]["passed"] for r in fixtures_results)
    failures = []
    for r in fixtures_results:
        if r["summary"]["passed"] != r["summary"]["total"]:
            failed_checks = [c for c in r.get("status_checks", []) if not c["pass"]]
            failures.append({
                "fixture": r["fixture"],
                "failure_type": "logic_error",
                "checks_failed": [{
                    "folder": c["folder"],
                    "expected": c["expected"],
                    "actual": c["actual"],
                    "explanation": next((a.get("explanation", "") for a in c.get("actions", [])), ""),
                } for c in failed_checks],
            })

    return {
        "status": "PASS" if total_passed == total_checks else "FAIL",
        "total_fixtures": len(fixtures_results),
        "passed_fixtures": sum(1 for r in fixtures_results if r["summary"]["passed"] == r["summary"]["total"]),
        "failed_fixtures": [r["fixture"] for r in fixtures_results if r["summary"]["passed"] != r["summary"]["total"]],
        "failures": failures,
        "exit_code": 0 if total_passed == total_checks else 1,
        "execution_time_ms": total_time_ms,
        "timestamp": datetime.now().isoformat(),
    }


def main():
    parser = argparse.ArgumentParser(description="Run evdb-diff fixtures")
    parser.add_argument("--root", default=".", help="Project root")
    parser.add_argument("--fixtures", default=None, help="Comma-separated fixture names (default: all)")
    args = parser.parse_args()

    repo = Path(args.root).resolve()
    script = repo / ".claude" / "skills" / "evdb-diff" / "scripts" / "evdb_diff.py"
    fixtures_dir = repo / ".claude" / "test-fixtures"

    # Find fixtures
    if args.fixtures:
        fixture_names = args.fixtures.split(",")
    else:
        fixture_names = sorted([
            d.name for d in fixtures_dir.iterdir()
            if d.is_dir() and (d / "expected-diff.json").exists()
        ])

    # Results directory
    results_dir = fixtures_dir / "latest"
    if results_dir.exists():
        shutil.rmtree(results_dir)
    results_dir.mkdir()

    # Restore clean state
    subprocess.run(["git", "restore", ".eventmodel/.slices/index.json"], capture_output=True, cwd=str(repo))
    impl_hashes = repo / ".eventmodel" / "implementation-hashes.json"
    if impl_hashes.exists():
        impl_hashes.unlink()

    # Run fixtures
    all_results = []
    total_start = time.time()

    for fixture in fixture_names:
        result = run_fixture(repo, fixture, script, results_dir)
        s = result.get("summary", {})
        icon = "✓" if s.get("passed", 0) == s.get("total", 0) else "✗"
        elapsed = result.get("metrics", {}).get("execution_time_ms", 0)
        print(f"  {icon} {fixture}: {s.get('passed', 0)}/{s.get('total', 0)} ({elapsed}ms)")
        all_results.append(result)

    total_ms = int((time.time() - total_start) * 1000)

    # Generate reports
    md = generate_markdown(all_results, total_ms)
    with open(results_dir / "report.md", "w") as f:
        f.write(md)

    html_content = generate_html(all_results, total_ms)
    with open(results_dir / "report.html", "w") as f:
        f.write(html_content)

    ci = generate_ci_report(all_results, total_ms)
    with open(results_dir / "ci-report.json", "w") as f:
        json.dump(ci, f, indent=2)

    # Restore clean state
    subprocess.run(["git", "restore", ".eventmodel/.slices/index.json"], capture_output=True, cwd=str(repo))
    if impl_hashes.exists():
        impl_hashes.unlink()

    # Summary
    total_passed = sum(r["summary"]["passed"] for r in all_results)
    total_checks = sum(r["summary"]["total"] for r in all_results)
    print(f"\n  {total_passed}/{total_checks} checks passed across {len(all_results)} fixtures ({total_ms}ms)")
    print(f"  Reports: {results_dir}/report.md, report.html, ci-report.json")

    sys.exit(ci["exit_code"])


if __name__ == "__main__":
    main()
