#!/usr/bin/env bash
# Copies this case's fixture project into the empty run workspace as a committed git repository.
set -euo pipefail
cp -R "$(dirname "$0")/fixture/." .
git init -q
git add -A
git -c user.name=fixture -c user.email=fixture@example.com commit -q -m "Existing project"
