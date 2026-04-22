#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────
// lint-security-definer.mjs
//
// Enforces: every new `CREATE FUNCTION ... SECURITY DEFINER` in
// supabase/migrations/ must also pin `SET search_path = ...`
// inside the same CREATE statement (Finding F-029 / Epic F-1).
//
// Historical migrations 001–030 are grandfathered — migration
// 031_search_path_hardening.sql ALTERs each of those functions to
// pin search_path, so they are already hardened in prod.
//
// A new SECURITY DEFINER function added in a ≥031 migration MUST
// include the SET clause at definition time so a fresh install
// never has an unhardened definer function, even for a moment.
// ─────────────────────────────────────────────────────────────
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';
// Files strictly below this prefix are grandfathered. 031 and later
// are expected to comply with the rule at definition time.
const GRANDFATHER_CEILING = 31;

function fileOrdinal(name) {
	const m = name.match(/^(\d+)/);
	return m ? Number.parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}

/**
 * Extract every CREATE [OR REPLACE] FUNCTION statement body, delimited by
 * the matching dollar-quote terminator. Returns `{ header, full, lineStart }`
 * where `header` is everything from `CREATE` up to (but not including) the
 * opening dollar-quote tag and `full` is the entire statement.
 */
function extractFunctionStatements(sql) {
	const stmts = [];
	const createRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+/gi;
	let m;
	while ((m = createRe.exec(sql)) !== null) {
		const start = m.index;
		// Find the opening dollar-quote tag AS $tag$ or AS $$
		const asMatch = sql.slice(start).match(/AS\s+(\$[A-Za-z0-9_]*\$)/);
		if (!asMatch) continue;
		const tag = asMatch[1];
		const asIdx = start + asMatch.index + asMatch[0].length;
		const closeIdx = sql.indexOf(tag, asIdx);
		if (closeIdx === -1) continue;
		const end = closeIdx + tag.length;
		const full = sql.slice(start, end);
		const header = sql.slice(start, start + asMatch.index);
		const lineStart = sql.slice(0, start).split('\n').length;
		stmts.push({ header, full, lineStart });
		createRe.lastIndex = end;
	}
	return stmts;
}

function lintFile(file, sql) {
	const violations = [];
	for (const stmt of extractFunctionStatements(sql)) {
		// Only care about SECURITY DEFINER.
		if (!/\bSECURITY\s+DEFINER\b/i.test(stmt.header)) continue;
		// Must pin search_path somewhere before the AS $...$ body.
		if (!/\bSET\s+search_path\s*=/i.test(stmt.header)) {
			const name =
				stmt.header.match(/FUNCTION\s+([A-Za-z_][A-Za-z0-9_]*)/i)?.[1] ??
				'<unknown>';
			violations.push({ file, line: stmt.lineStart, name });
		}
	}
	return violations;
}

function main() {
	let allViolations = [];
	const files = readdirSync(MIGRATIONS_DIR)
		.filter((f) => f.endsWith('.sql'))
		.sort();

	for (const f of files) {
		if (fileOrdinal(f) < GRANDFATHER_CEILING) continue;
		const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
		allViolations = allViolations.concat(lintFile(f, sql));
	}

	if (allViolations.length === 0) {
		console.log(
			`OK: every SECURITY DEFINER function in migrations ≥ ${GRANDFATHER_CEILING} pins search_path.`,
		);
		return;
	}

	for (const v of allViolations) {
		console.error(
			`::error file=${MIGRATIONS_DIR}/${v.file},line=${v.line}::SECURITY DEFINER function ${v.name} is missing \`SET search_path = ...\` — add \`SET search_path = public, pg_temp\` before the AS $$ body (Epic F-1 / finding F-029).`,
		);
	}
	console.error(
		`\n${allViolations.length} SECURITY DEFINER function(s) without a pinned search_path.`,
	);
	process.exit(1);
}

main();
