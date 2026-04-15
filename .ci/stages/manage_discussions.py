#!/usr/bin/env python3
"""Manage GitHub Discussions for pipeline clarifications and reports.

Modes:
    read    — Fetch answered clarification Discussions → /tmp/clarification-answers.json
    create  — Read /tmp/clarifications.json → create Discussion per question → /tmp/discussion-links.json
    create-report — Create a single Discussion with a report body

Usage:
    python3 .ci/stages/manage_discussions.py --mode read   --repo owner/repo --context Portfolio
    python3 .ci/stages/manage_discussions.py --mode create --repo owner/repo
    python3 .ci/stages/manage_discussions.py --mode create-report --repo owner/repo \
        --title "Usage Report: March 2026" --body-file /tmp/usage-report.md --category "Usage Reports"

Requires: gh CLI authenticated with discussions:write scope.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

PIPELINE_CONFIG = Path(__file__).parent.parent / "config" / "pipeline.json"


def _load_config() -> dict:
    try:
        return json.load(open(PIPELINE_CONFIG))
    except Exception:
        return {}


def _load_json(path: str | Path) -> dict | list | None:
    try:
        return json.load(open(path))
    except Exception:
        return None


def _gh_graphql(query: str, variables: dict | None = None) -> dict | None:
    """Execute a GraphQL query via gh api graphql."""
    cmd = ["gh", "api", "graphql", "-f", f"query={query}"]
    if variables:
        for k, v in variables.items():
            cmd.extend(["-f", f"{k}={v}"])
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode != 0:
            print(f"  GraphQL error: {result.stderr.strip()}", file=sys.stderr)
            return None
        return json.loads(result.stdout)
    except Exception as e:
        print(f"  GraphQL exception: {e}", file=sys.stderr)
        return None


def _get_repo_and_category(repo: str, category_name: str) -> tuple[str, str] | None:
    """Fetch repository node ID and discussion category ID."""
    owner, name = repo.split("/")
    query = """
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        id
        discussionCategories(first: 25) {
          nodes { id name }
        }
      }
    }
    """
    data = _gh_graphql(query, {"owner": owner, "name": name})
    if not data:
        return None

    repo_data = data.get("data", {}).get("repository", {})
    repo_id = repo_data.get("id", "")
    categories = repo_data.get("discussionCategories", {}).get("nodes", [])

    cat_id = ""
    for cat in categories:
        if cat.get("name", "").lower() == category_name.lower():
            cat_id = cat["id"]
            break

    if not repo_id:
        print("  Could not find repository ID", file=sys.stderr)
        return None
    if not cat_id:
        print(f"  Discussion category '{category_name}' not found.", file=sys.stderr)
        print(f"  Create it in repo Settings > Discussions > Categories.", file=sys.stderr)
        return None

    return repo_id, cat_id


# ── Mode: read ──────────────────────────────────────────────────

def mode_read(repo: str, context: str):
    """Fetch clarification answers from existing Discussions."""
    config = _load_config()
    disc_config = config.get("discussions", {})
    if not disc_config.get("enabled", False):
        print("  Discussions disabled in pipeline.json — skipping read")
        return

    category_name = disc_config.get("category_name", "Spec Clarifications")
    owner, name = repo.split("/")

    # Query discussions in the clarification category
    query = """
    query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) {
        discussions(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes {
            title
            body
            url
            closed
            labels(first: 5) { nodes { name } }
            comments(first: 20) {
              nodes {
                author { login }
                body
                createdAt
                isMinimized
              }
            }
          }
        }
      }
    }
    """
    data = _gh_graphql(query, {"owner": owner, "name": name})
    if not data:
        print("  Could not fetch discussions")
        return

    discussions = data.get("data", {}).get("repository", {}).get("discussions", {}).get("nodes", [])

    # Filter to clarification discussions for this context
    answers: list[dict] = []
    for d in discussions:
        title = d.get("title", "")
        # Match discussions created by this pipeline (title pattern)
        if f"[{context}]" not in title and "Spec Clarification" not in title:
            continue

        # Collect human (non-bot) comments as answers
        for comment in d.get("comments", {}).get("nodes", []):
            if comment.get("isMinimized"):
                continue
            author = comment.get("author", {}).get("login", "")
            if author.endswith("[bot]"):
                continue
            answers.append({
                "discussion_title": title,
                "discussion_url": d.get("url", ""),
                "author": author,
                "body": comment.get("body", ""),
                "created_at": comment.get("createdAt", ""),
            })

    if answers:
        Path("/tmp/clarification-answers.json").write_text(
            json.dumps({"answers": answers, "count": len(answers)}, indent=2) + "\n"
        )
        print(f"  Loaded {len(answers)} clarification answers from {len(discussions)} discussions")

        # Also write plain text for backward compatibility with implement_slice.py
        with open("/tmp/pr-clarification-answers.txt", "w") as f:
            for a in answers:
                f.write(f"### Comment by @{a['author']} ({a['created_at']})\n")
                f.write(f"Discussion: {a['discussion_url']}\n")
                f.write(f"{a['body']}\n\n")
    else:
        print("  No clarification answers found in discussions")


# ── Mode: create ────────────────────────────────────────────────

def mode_create(repo: str):
    """Create Discussions for unresolved clarifications."""
    config = _load_config()
    disc_config = config.get("discussions", {})
    if not disc_config.get("enabled", False):
        print("  Discussions disabled in pipeline.json — skipping create")
        return

    clarifications = _load_json("/tmp/clarifications.json")
    if not clarifications or not clarifications.get("clarifications"):
        print("  No clarifications to create discussions for")
        return

    category_name = disc_config.get("category_name", "Spec Clarifications")
    ids = _get_repo_and_category(repo, category_name)
    if not ids:
        return
    repo_id, cat_id = ids

    links: list[dict] = []

    for c in clarifications["clarifications"]:
        slices_label = ", ".join(c.get("slices", []))
        fp = c.get("fingerprint", "generic")
        fc = c.get("failure_class", "unknown")

        title = f"Spec Clarification [{slices_label}]: {fc} ({fp})"
        body = c.get("question", "No question generated.")
        body += "\n\n---\n"
        body += f"*Generated by evdb CI pipeline. Fingerprint: `{fp}`*\n"
        body += f"*Spec ref: `{c.get('spec_ref', 'unknown')}`*"

        mutation = """
        mutation($repoId: ID!, $catId: ID!, $title: String!, $body: String!) {
          createDiscussion(input: {repositoryId: $repoId, categoryId: $catId, title: $title, body: $body}) {
            discussion { id url number }
          }
        }
        """
        result = _gh_graphql(mutation, {
            "repoId": repo_id, "catId": cat_id,
            "title": title, "body": body,
        })

        if result:
            disc = result.get("data", {}).get("createDiscussion", {}).get("discussion", {})
            links.append({
                "fingerprint": fp,
                "slices": c.get("slices", []),
                "discussion_url": disc.get("url", ""),
                "discussion_id": disc.get("id", ""),
                "discussion_number": disc.get("number", 0),
            })
            print(f"  Created discussion: {disc.get('url', '?')}")
        else:
            print(f"  Failed to create discussion for {slices_label}")

    if links:
        Path("/tmp/discussion-links.json").write_text(
            json.dumps({"discussions": links, "count": len(links)}, indent=2) + "\n"
        )


# ── Mode: create-report ────────────────────────────────────────

def mode_create_report(repo: str, title: str, body_file: str, category: str | None):
    """Create a single Discussion with a report body."""
    config = _load_config()
    disc_config = config.get("discussions", {})
    category_name = category or disc_config.get("report_category_name", "Usage Reports")

    ids = _get_repo_and_category(repo, category_name)
    if not ids:
        return

    repo_id, cat_id = ids

    try:
        body = Path(body_file).read_text()
    except Exception as e:
        print(f"  Could not read body file: {e}", file=sys.stderr)
        return

    mutation = """
    mutation($repoId: ID!, $catId: ID!, $title: String!, $body: String!) {
      createDiscussion(input: {repositoryId: $repoId, categoryId: $catId, title: $title, body: $body}) {
        discussion { id url number }
      }
    }
    """
    result = _gh_graphql(mutation, {
        "repoId": repo_id, "catId": cat_id,
        "title": title, "body": body,
    })

    if result:
        disc = result.get("data", {}).get("createDiscussion", {}).get("discussion", {})
        print(f"  Created report discussion: {disc.get('url', '?')}")
    else:
        print("  Failed to create report discussion")


# ── CLI ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Manage GitHub Discussions")
    parser.add_argument("--mode", required=True, choices=["read", "create", "create-report"])
    parser.add_argument("--repo", required=True, help="owner/repo")
    parser.add_argument("--context", default="", help="Context name (for read mode)")
    parser.add_argument("--title", default="", help="Discussion title (for create-report)")
    parser.add_argument("--body-file", default="", help="Path to body markdown (for create-report)")
    parser.add_argument("--category", default="", help="Override category name (for create-report)")
    args = parser.parse_args()

    if args.mode == "read":
        mode_read(args.repo, args.context)
    elif args.mode == "create":
        mode_create(args.repo)
    elif args.mode == "create-report":
        if not args.title or not args.body_file:
            print("--title and --body-file required for create-report mode", file=sys.stderr)
            sys.exit(1)
        mode_create_report(args.repo, args.title, args.body_file, args.category or None)


if __name__ == "__main__":
    main()
