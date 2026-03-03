# Vibe Repo — Copilot Instructions

This repo hosts multiple independent HTML+TypeScript projects, each living in its own
top-level folder. The GitHub Actions workflows automatically build and deploy each project
to `gelisam.com/vibe/<project-name>`.

## Creating a new project

When asked to "create a project which ...", create a new top-level folder named after the
project (lowercase, hyphenated, e.g. `my-cool-project`). Use the `hello-world` folder as a
template — copy its structure and adapt it to the new project's requirements.

### Required folder structure

```
<project-name>/
  index.html        # entry point, must load dist/bundle.js
  src/
    main.ts         # TypeScript entry point
  package.json      # must have a "build" script that outputs to dist/
  tsconfig.json
```

### Build requirements

- The `build` script in `package.json` **must** produce a `dist/` directory.
- `dist/` must contain at least `index.html` and `bundle.js`.
- The build toolchain used in `hello-world` is **browserify + tsify + terser + copyfiles**;
  keep using the same toolchain unless there is a strong reason to deviate.
- Do not commit the `dist/` or `node_modules/` directories.

### Why this structure matters

The `deploy-pr.yml` workflow detects changed top-level directories, checks for a
`package.json`, runs `npm ci && npm run build`, and copies `dist/*` to the server.
The `deploy.yml` workflow does the same for a manually chosen project on `master`.
Any project that does not follow the structure above will be silently skipped or fail to
deploy correctly.

## Secrets required by the workflows

| Secret              | Description                                               |
|---------------------|-----------------------------------------------------------|
| `SSH_PRIVATE_KEY`   | Private key for SSH access to the deployment server       |
| `SERVER_HOST`       | Hostname of the deployment server (e.g. `gelisam.com`)    |
| `SSH_USER`          | SSH username on the server                                |
| `DEPLOY_BASE_PATH`  | Absolute server path for the vibe root (e.g. `/var/www/html/vibe`) |
| `BASE_URL`          | Public base URL for all projects (e.g. `https://gelisam.com/vibe`) |
