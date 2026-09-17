/* eslint-disable */
// @ts-nocheck
/**
 * Imports a Meta instant-form export into the InstantLead collection.
 *
 *   npx tsx import-instant-leads.ts <file.csv>              -> DRY RUN
 *   npx tsx import-instant-leads.ts <file.csv> --confirm    -> writes
 *
 * Meta's Leads Center exports CSV (and XLSX — export as CSV for this). Column
 * names vary by form, so headers are matched loosely: anything containing
 * "phone" is the number, "full_name" or "name" the name, and so on. Every
 * original column is kept in `raw` so nothing from the file is lost.
 *
 * Re-running the same file is safe: rows are upserted on Meta's lead id, or on
 * the phone number when the export has no id.
 */
import fs from "fs";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { InstantLead } from "./src/models/InstantLead";
import { normalizePhone } from "./src/utils/phone";

dotenv.config();

const file = process.argv[2];
const CONFIRMED = process.argv.includes("--confirm");

/** Minimal RFC4180 parser: handles quoted fields, embedded commas and newlines. */
function parseDelimited(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") + 1 || undefined);
  const delim = firstLine.split("\t").length > firstLine.split(",").length ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/**
 * Meta's Leads Center exports UTF-16LE with a byte-order mark and tab
 * separators — reading that as UTF-8 yields a null byte between every
 * character. Decode by BOM, falling back to UTF-8.
 */
function readText(path: string): string {
  const buf = fs.readFileSync(path);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString("utf16le");
  if (buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    swapped.swap16();
    return swapped.toString("utf16le");
  }
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString("utf8");
  return buf.toString("utf8");
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Finds the first header matching any of these fragments. */
const pick = (headers: string[], row: string[], ...fragments: string[]) => {
  for (const frag of fragments) {
    const i = headers.findIndex((h) => norm(h).includes(frag));
    if (i !== -1 && row[i]?.trim()) return row[i].trim();
  }
  return "";
};

async function main() {
  if (!file) {
    console.error("\nUsage: npx tsx import-instant-leads.ts <file.csv> [--confirm]\n");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`\nNo such file: ${file}\n`);
    process.exit(1);
  }

  const rows = parseDelimited(readText(file));
  const headers = rows[0];
  const body = rows.slice(1);

  console.log(`\nFile: ${file}`);
  console.log(`Columns: ${headers.join(" | ")}`);
  console.log(`Rows: ${body.length}`);
  console.log(CONFIRMED ? "\n*** LIVE RUN ***\n" : "\n--- DRY RUN (nothing written) ---\n");

  const parsed = body.map((r) => {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { if (r[i]?.trim()) raw[h] = r[i].trim(); });
    return {
      fullName: pick(headers, r, "fullname", "name") || "Unnamed lead",
      phone: normalizePhone(pick(headers, r, "phone", "mobile", "contact")),
      email: pick(headers, r, "email"),
      city: pick(headers, r, "city", "town", "location"),
      leadId: pick(headers, r, "leadid", "id"),
      formName: pick(headers, r, "formname", "form"),
      campaignName: pick(headers, r, "campaignname", "campaign"),
      platform: pick(headers, r, "platform"),
      submittedAt: pick(headers, r, "createdtime", "submitted", "time"),
      raw,
    };
  });

  const usable = parsed.filter((p) => /^[6-9]\d{9}$/.test(p.phone));
  const skipped = parsed.filter((p) => !/^[6-9]\d{9}$/.test(p.phone));

  console.log(`  ${usable.length} with a usable Indian mobile`);
  console.log(`  ${skipped.length} skipped\n`);
  usable.slice(0, 10).forEach((p) =>
    console.log(`    ${p.fullName.slice(0, 26).padEnd(28)} ${p.phone}  ${p.email || ""}`)
  );
  if (usable.length > 10) console.log(`    … and ${usable.length - 10} more`);
  if (skipped.length) {
    console.log("\n  Skipped (no usable phone):");
    skipped.slice(0, 10).forEach((p) => console.log(`    ${p.fullName} — "${p.raw ? Object.values(p.raw)[0] : ""}"`));
  }

  if (!CONFIRMED) {
    console.log("\n  Re-run with --confirm to write.\n");
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI as string);
  let imported = 0, updated = 0;
  for (const p of usable) {
    const doc = {
      fullName: p.fullName,
      phone: p.phone,
      email: p.email || undefined,
      city: p.city || undefined,
      leadId: p.leadId || undefined,
      formName: p.formName || undefined,
      campaignName: p.campaignName || undefined,
      platform: p.platform || undefined,
      submittedAt: p.submittedAt && !isNaN(Date.parse(p.submittedAt)) ? new Date(p.submittedAt) : undefined,
      raw: p.raw,
    };
    const filter = doc.leadId ? { leadId: doc.leadId } : { phone: doc.phone };
    const existing = await InstantLead.findOne(filter);
    if (existing) {
      await InstantLead.updateOne(filter, { $set: { ...doc, status: existing.status } });
      updated++;
    } else {
      await InstantLead.create(doc);
      imported++;
    }
  }
  console.log(`\n  ${imported} added, ${updated} updated.\n`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
