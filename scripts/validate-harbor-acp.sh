#!/usr/bin/env bash
set -euo pipefail

# Manual interoperability gate only. This script is intentionally not wired
# into make test, CI, or any Go test package: Harbor owns its Python runtime
# and must remain an external validation dependency.

harbor_root="${HARBOR_ROOT:-/home/free/src/harbor}"
mothx_bin="${MOTHX_BIN:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/bin/mothx}"
harbor_python="${HARBOR_PYTHON:-python3}"
workspace="${HARBOR_WORKSPACE:-$(mktemp -d "${TMPDIR:-/tmp}/mothx-harbor-acp.XXXXXX")}"
logs_dir="${HARBOR_LOGS_DIR:-${workspace}/harbor-logs}"
runner="${harbor_root}/src/harbor/agents/installed/acp_runner.py"

if [[ ! -f "${runner}" ]]; then
    printf 'Harbor ACP runner not found: %s\n' "${runner}" >&2
    exit 2
fi
if [[ ! -x "${mothx_bin}" ]]; then
    printf 'MothX binary not executable: %s\nBuild it first or set MOTHX_BIN.\n' "${mothx_bin}" >&2
    exit 2
fi
if ! command -v "${harbor_python}" >/dev/null 2>&1; then
    printf "Harbor Python executable not found: %s\nSet HARBOR_PYTHON to Harbor's prepared environment.\n" "${harbor_python}" >&2
    exit 2
fi

mkdir -p "${workspace}" "${logs_dir}"

# The child receives these variables through Harbor's runner. Keep the model
# explicit so this gate exercises the requested-model and set-config path.
: "${HARBOR_ACP_REQUESTED_MODEL:?Set HARBOR_ACP_REQUESTED_MODEL=provider/model}"
export HARBOR_ACP_PERMISSION_MODE="${HARBOR_ACP_PERMISSION_MODE:-allow}"
export HARBOR_ACP_AUTH_POLICY="${HARBOR_ACP_AUTH_POLICY:-auto}"
export HARBOR_ACP_MCP_SERVERS_JSON="${HARBOR_ACP_MCP_SERVERS_JSON:-[]}"
export MOTHX_DIR="${MOTHX_DIR:-${workspace}/mothx-config}"

launcher="${MOTHX_ACP_LAUNCHER:-${mothx_bin} acp}"
printf 'Harbor ACP validation\n  harbor: %s\n  workspace: %s\n  logs: %s\n' \
    "${harbor_root}" "${workspace}" "${logs_dir}"

cd "${workspace}"
exec "${harbor_python}" "${runner}" \
    --instruction "Reply with a short confirmation and do not modify files." \
    --logs-dir "${logs_dir}" \
    --launcher "${launcher}"
