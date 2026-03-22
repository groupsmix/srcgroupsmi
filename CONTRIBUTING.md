# Contributing to GroupsMix

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and fill in your keys
4. Start the dev server: `npm run dev`

## Making Changes

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes
3. Run tests: `npm test`
4. Build to check for errors: `npm run build`
5. Commit with a clear message:
   ```bash
   git commit -m "feat: add new feature description"
   ```
6. Push and open a Pull Request against `main`

## Code Style

- **JavaScript:** Vanilla JS, no frameworks on the frontend
- **CSS:** Use CSS custom properties defined in `shared.css`
- **Astro pages:** Use `BaseLayout.astro` for all pages
- **Server functions:** No `console.log` in `functions/` (use `console.warn` or `console.error`)

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `style:` — Formatting (no code change)
- `refactor:` — Code restructuring
- `test:` — Adding or updating tests
- `chore:` — Maintenance tasks

## Reporting Issues

Open a [GitHub Issue](https://github.com/groupsmix/srcgroupsmi/issues) with:

- A clear title and description
- Steps to reproduce (if applicable)
- Expected vs. actual behavior

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
