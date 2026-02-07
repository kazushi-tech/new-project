# GitHub Branch Protection Setup Guide

How to configure branch protection rules for the `main` branch to enforce SpecForge Review workflow.

## Prerequisites

- Repository pushed to GitHub
- Admin access to the repository
- `.github/CODEOWNERS` updated with actual GitHub usernames
- The `requirements-review` workflow has run at least once (needed to register the status check name)

## Configuration Steps

### 1. Open Branch Protection Settings

1. Go to your repository on GitHub.com
2. Click **Settings** > **Branches** (under "Code and automation")
3. Click **Add branch protection rule** (or **Edit** if `main` rule exists)

### 2. Branch Name Pattern

Enter: `main`

### 3. Require a Pull Request Before Merging

- [x] **Require a pull request before merging**
  - [x] **Require approvals** - Set to `1` (minimum)
  - [x] **Require review from Code Owners**

### 4. Require Status Checks

- [x] **Require status checks to pass before merging**
  - [x] **Require branches to be up to date before merging**
  - Search and add: `specforge-review-check`

> **Note**: The `specforge-review-check` status check only appears after the workflow has run once. Create a test PR that modifies `requirements/` to trigger it.

### 5. Additional Settings

- [x] **Do not allow bypassing the above settings**
- [x] **Require conversation resolution before merging** (recommended)

### 6. Save

Click **Create** or **Save changes**.

## Label Setup

Create a `requirements-approved` label for manual approval tracking:

1. Go to **Issues** > **Labels** > **New label**
2. Name: `requirements-approved`
3. Color: `#0E8A16` (green)
4. Description: "Requirements have been reviewed and approved by CODEOWNERS"

## Verification

1. Try direct push to `main` - should be rejected
2. Create a PR modifying `requirements/` - should show required checks
3. Verify `requirements-review` appears as required status check
4. Verify CODEOWNERS are auto-requested as reviewers

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Status check not listed | Run the workflow once via a test PR |
| CODEOWNERS not enforced | Check that valid GitHub usernames are in `.github/CODEOWNERS` |
| Admin can bypass | Enable "Do not allow bypassing" |
