#!/bin/bash
set -euo pipefail

# Publish Release Script
# Bumps version, commits, tags, pushes.
# CI publishes to npm when it detects the tag.

echo "Publishing pi-mcp-server Release"
echo "================================="

# Pre-flight checks
command -v gh >/dev/null 2>&1 || { echo "Error: gh CLI is not installed"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Error: gh is not authenticated (run 'gh auth login')"; exit 1; }

# Ensure we're on main branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "Error: Must be on main branch to release"
    echo "   Current branch: $CURRENT_BRANCH"
    exit 1
fi

# Ensure working directory is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "Error: Working directory is not clean"
    echo "   Please commit or stash your changes"
    exit 1
fi

# Pull latest changes
echo "Pulling latest changes..."
git pull

# Run tests
echo "Running tests..."
npm test

# Build the project
echo "Building project..."
npm run build

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Current version: $CURRENT_VERSION"

# Ask for new version
echo ""
echo "What type of release is this?"
echo "1) Patch (bug fixes)"
echo "2) Minor (new features)"
echo "3) Major (breaking changes)"
read -p "Enter choice (1-3): " RELEASE_TYPE

case $RELEASE_TYPE in
    1) npm version patch --no-git-tag-version ;;
    2) npm version minor --no-git-tag-version ;;
    3) npm version major --no-git-tag-version ;;
    *) echo "Invalid choice"; exit 1 ;;
esac

# Get new version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "New version: $NEW_VERSION"

# Update changelog
echo ""
echo "Please update CHANGELOG.md with the new version details"
echo "   New version: $NEW_VERSION"
read -p "Press enter when done..."

# Commit version bump
git add package.json package-lock.json CHANGELOG.md
git commit -m "Bump version to $NEW_VERSION"

# Create git tag
git tag "v$NEW_VERSION"

# Push changes and tags
echo "Pushing changes to GitHub..."
git push
git push --tags

# Create GitHub release
echo "Creating GitHub release..."
gh release create "v$NEW_VERSION" \
    --title "Release v$NEW_VERSION" \
    --notes "See CHANGELOG.md for details" \
    --latest

echo ""
echo "Release v$NEW_VERSION tagged and pushed!"
echo "CI will publish to npm when the tag is detected."
echo "Check: https://github.com/pandysp/pi-mcp-server/actions"
echo ""
echo "Post-release checklist:"
echo "[ ] Test the new version with: npx pi-mcp-server@latest"
echo "[ ] Update any documentation if needed"
echo "[ ] Announce the release if significant"
