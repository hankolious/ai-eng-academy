#!/usr/bin/env bash
# Reusable secret scanner. Exit 0 = clean, 1 = secret(s) found, 2 = scan error.
# With no args, scans all git-tracked files. With args, scans those paths.
# Portable to macOS bash 3.2 (no mapfile/readarray).
set -u

PATTERN='AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,}|(secret|password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret|aws_secret_access_key)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{8,}["'"'"']|Bearer[[:space:]]+[A-Za-z0-9._-]{20,}'

if [ "$#" -eq 0 ]; then
  # shellcheck disable=SC2046
  set -- $(git ls-files)
fi

grep -rIEn "$PATTERN" "$@"
status=$?

if [ "$status" -eq 0 ]; then
  echo ">>> SECRETS FOUND"
  exit 1
elif [ "$status" -eq 1 ]; then
  echo ">>> CLEAN: no secret patterns matched"
  exit 0
else
  echo ">>> SCAN ERROR (grep status $status)"
  exit 2
fi
