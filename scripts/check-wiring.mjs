#!/usr/bin/env node
/**
 * UI-Wiring Manifest CI gate.
 *
 * 全 construction/wiring/*.wiring.json を読み、各 element について以下を検査する:
 *   - alive=false の element は non-empty な decorative を持つこと
 *   - alive フィールド自体が存在すること (true/false 必須)
 *   - kind / selector / wiredTo の必須フィールドが揃っていること
 *
 * 不備があれば exit 1 + 該当 element を stderr に出力。
 * 全 OK なら exit 0 + 要約を stdout。
 *
 * 仕様の正は: construction/wiring/SCHEMA.md
 *
 * Usage:
 *   node scripts/check-wiring.mjs
 *   pnpm check:wiring
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// repo root = scripts/ の 1 つ上
const REPO_ROOT = resolve(__dirname, '..');
const WIRING_DIR = join(REPO_ROOT, 'construction', 'wiring');

const REQUIRED_ELEMENT_FIELDS = ['selector', 'kind', 'wiredTo'];
const VALID_KINDS = new Set([
  'input',
  'button',
  'link',
  'display',
  'toggle',
  'nav',
]);

/** @typedef {{ selector?: string, kind?: string, wiredTo?: string, alive?: boolean, decorative?: string, userTask?: string }} Element */
/** @typedef {{ screen?: string, implPath?: string, elements?: Element[] }} WiringDoc */

/** @returns {{file:string, screen:string|undefined, index:number, element:Element, message:string}[]} */
function checkDoc(file, doc) {
  /** @type {ReturnType<typeof checkDoc>} */
  const errs = [];
  if (!doc || typeof doc !== 'object') {
    errs.push({
      file,
      screen: undefined,
      index: -1,
      element: /** @type {Element} */ ({}),
      message: 'top-level JSON is not an object',
    });
    return errs;
  }
  if (!doc.screen || typeof doc.screen !== 'string') {
    errs.push({
      file,
      screen: undefined,
      index: -1,
      element: /** @type {Element} */ ({}),
      message: 'missing or non-string "screen" field',
    });
  }
  if (!doc.implPath || typeof doc.implPath !== 'string') {
    errs.push({
      file,
      screen: doc.screen,
      index: -1,
      element: /** @type {Element} */ ({}),
      message: 'missing or non-string "implPath" field',
    });
  }
  if (!Array.isArray(doc.elements)) {
    errs.push({
      file,
      screen: doc.screen,
      index: -1,
      element: /** @type {Element} */ ({}),
      message: 'missing or non-array "elements" field',
    });
    return errs;
  }
  doc.elements.forEach((el, i) => {
    if (!el || typeof el !== 'object') {
      errs.push({
        file,
        screen: doc.screen,
        index: i,
        element: /** @type {Element} */ ({}),
        message: `elements[${i}] is not an object`,
      });
      return;
    }
    for (const f of REQUIRED_ELEMENT_FIELDS) {
      if (!el[f] || typeof el[f] !== 'string') {
        errs.push({
          file,
          screen: doc.screen,
          index: i,
          element: el,
          message: `elements[${i}] missing or non-string field "${f}"`,
        });
      }
    }
    if (el.kind && !VALID_KINDS.has(el.kind)) {
      errs.push({
        file,
        screen: doc.screen,
        index: i,
        element: el,
        message: `elements[${i}].kind="${el.kind}" is not one of ${[...VALID_KINDS].join('|')}`,
      });
    }
    if (typeof el.alive !== 'boolean') {
      errs.push({
        file,
        screen: doc.screen,
        index: i,
        element: el,
        message: `elements[${i}].alive must be boolean (got ${typeof el.alive})`,
      });
      return;
    }
    if (el.alive === false) {
      const dec = el.decorative;
      if (!dec || typeof dec !== 'string' || dec.trim().length === 0) {
        errs.push({
          file,
          screen: doc.screen,
          index: i,
          element: el,
          message:
            `elements[${i}] (selector="${el.selector ?? '?'}") has alive=false but missing/empty "decorative" reason. ` +
            `Add a decorative field explaining why this element is intentionally inert ` +
            `(e.g. "design ref only", "未実装 placeholder", "固定サンプル値"). See construction/wiring/SCHEMA.md.`,
        });
      }
    }
  });
  return errs;
}

function main() {
  if (!existsSync(WIRING_DIR)) {
    console.error(`[check-wiring] wiring dir not found: ${WIRING_DIR}`);
    process.exit(1);
  }
  const files = readdirSync(WIRING_DIR).filter((f) => f.endsWith('.wiring.json'));
  if (files.length === 0) {
    console.error(`[check-wiring] no *.wiring.json files in ${WIRING_DIR}`);
    process.exit(1);
  }

  /** @type {ReturnType<typeof checkDoc>} */
  let allErrs = [];
  let totalElements = 0;
  let totalAliveFalse = 0;
  let totalAliveTrue = 0;
  const perScreen = [];

  for (const f of files.sort()) {
    const abs = join(WIRING_DIR, f);
    let doc;
    try {
      doc = JSON.parse(readFileSync(abs, 'utf8'));
    } catch (e) {
      allErrs.push({
        file: abs,
        screen: undefined,
        index: -1,
        element: {},
        message: `JSON parse failed: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }
    const errs = checkDoc(abs, doc);
    allErrs = allErrs.concat(errs);
    const elements = Array.isArray(doc?.elements) ? doc.elements : [];
    const aliveFalse = elements.filter((e) => e && e.alive === false).length;
    const aliveTrue = elements.filter((e) => e && e.alive === true).length;
    totalElements += elements.length;
    totalAliveFalse += aliveFalse;
    totalAliveTrue += aliveTrue;
    perScreen.push({
      screen: doc?.screen ?? '(unknown)',
      file: f,
      count: elements.length,
      aliveTrue,
      aliveFalse,
    });
  }

  if (allErrs.length > 0) {
    console.error('');
    console.error('[check-wiring] FAILED');
    console.error('-----------------------------------------------------------');
    for (const e of allErrs) {
      console.error(`  file: ${e.file}`);
      if (e.screen) console.error(`  screen: ${e.screen}`);
      if (e.index >= 0) console.error(`  index: ${e.index}`);
      if (e.element && e.element.selector) {
        console.error(`  selector: ${e.element.selector}`);
      }
      console.error(`  message: ${e.message}`);
      console.error('  ---');
    }
    console.error(
      `Total errors: ${allErrs.length}. Fix the listed elements and re-run \`pnpm check:wiring\`.`,
    );
    console.error('See construction/wiring/SCHEMA.md for rules.');
    process.exit(1);
  }

  // success report
  console.log('[check-wiring] OK');
  console.log('-----------------------------------------------------------');
  for (const s of perScreen) {
    console.log(
      `  ${s.screen.padEnd(36)} elements=${String(s.count).padStart(3)} alive=${String(s.aliveTrue).padStart(3)} dead=${String(s.aliveFalse).padStart(3)}  (${s.file})`,
    );
  }
  console.log('-----------------------------------------------------------');
  console.log(
    `Total: ${files.length} screens, ${totalElements} elements, ${totalAliveTrue} alive, ${totalAliveFalse} dead (all with decorative reason).`,
  );
  process.exit(0);
}

main();
