#!/bin/sh
# Every gate CI applies, run locally, in one command.
#
#   sh verify.sh          every gate
#   sh verify.sh --fast   the cheap tier only, for the edit loop
#
# CI runs this script rather than a copy of it
# (.github/workflows/deploy-demo.yml), so a new check is added here and
# nowhere else.
#
# `--fast` is a contract: the edit and Stop hooks in ~/.claude/hooks run it
# after every edit and at the end of every turn, so it has to finish in seconds.
# It keeps the type check and lint, and drops the audit (network), the SBOM
# check, the build, the suites and the size check.
#
# Three outcomes, because two would be a lie:
#
#   0  every check ran and passed
#   1  a check failed
#   2  a check could not run
set -eu

FAST=""
case "${1:-}" in
"") ;;
--fast) FAST=1 ;;
*)
    sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac

cd "$(dirname "$0")"

if [ ! -d node_modules ]; then
    echo "NOT RUN -- node_modules is missing; run: npm ci"
    exit 2
fi

LOGS="$(mktemp -d)"
trap 'rm -rf "$LOGS"' EXIT

FAILED=""

# Run a check, keep its output, and show that output only when it fails.
check() {
    name="$1"
    shift
    printf '%-20s' "$name"
    if "$@" >"$LOGS/$name.log" 2>&1; then
        echo "ok"
    else
        echo "FAIL"
        sed 's/^/    /' "$LOGS/$name.log"
        FAILED="$FAILED $name"
    fi
}

check typecheck npm run -s typecheck
check lint npm run -s lint

if [ -z "$FAST" ]; then
    check audit npm run -s audit:check
    check sbom npm run -s sbom:check
    # Build BEFORE the tests: tests/build/ skips itself when dist/ is missing,
    # and a skipped suite reports green while executing none of its checks.
    check build npm run -s build
    check tests npm run -s test:coverage
    check build-artifacts npm run -s test:build
    check size npm run -s size
fi

echo
if [ -n "$FAILED" ]; then
    echo "FAILED:$FAILED"
    exit 1
fi
if [ -n "$FAST" ]; then
    echo "fast checks passed -- run without --fast before a push"
else
    echo "all checks passed"
fi
